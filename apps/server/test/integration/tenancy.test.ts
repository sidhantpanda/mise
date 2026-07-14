import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { setUpClient, withHousehold, type SignedUpUserWithHousehold } from "../helpers/client.js";
import { makeMeal, makePantryItem, makeRecipe, makeShoppingItem } from "../helpers/factories.js";
import { waitForIndexed } from "../helpers/search.js";

// The one test that matters most in this suite: every household-scoped route,
// called by A's user with B's resource id, must 404 — not 403 (which would leak
// that the resource exists) and not 200 (which would leak the data itself). If a
// new household-scoped route is added later and isn't in the table below, that's
// the coverage gap to close.
setUpClient();

describe("household isolation", () => {
  let a: SignedUpUserWithHousehold;
  let b: SignedUpUserWithHousehold;

  beforeEach(async () => {
    a = await withHousehold({ householdName: "Household A" });
    b = await withHousehold({ householdName: "Household B" });
  });

  type Case = {
    label: string;
    base: string;
    create: () => Promise<{ id: string }>;
    patchBody?: Record<string, unknown>;
    // Shopping has no GET /:id route at all (only a bulk list) — the plan's table
    // assumed one existed; there isn't, so that leg is skipped for it rather than
    // asserting a 404 that would be true regardless of tenancy (no route matches).
    hasGetById?: boolean;
  };

  function cases(): Case[] {
    return [
      {
        label: "recipes",
        base: "/api/recipes",
        create: () => makeRecipe(b.household.id as string),
        patchBody: { name: "Renamed by A" },
      },
      {
        label: "meals",
        base: "/api/meals",
        create: async () => {
          const recipe = await makeRecipe(b.household.id as string);
          return makeMeal(b.household.id as string, { recipeId: recipe.id });
        },
        patchBody: { servings: 3 },
        hasGetById: false,
      },
      {
        label: "pantry",
        base: "/api/pantry",
        create: () => makePantryItem(b.household.id as string),
        patchBody: { name: "Renamed by A" },
        hasGetById: false,
      },
      {
        label: "shopping",
        base: "/api/shopping",
        create: () => makeShoppingItem(b.household.id as string),
        patchBody: { name: "Renamed by A" },
        hasGetById: false,
      },
    ];
  }

  for (const { label, base, create, patchBody, hasGetById = true } of cases()) {
    it(`${label}: PATCH/DELETE with another household's id 404 (and GET too, where it exists)`, async () => {
      const resource = await create();

      if (hasGetById) {
        await a.agent.get(`${base}/${resource.id}`).expect(404);
      }
      if (patchBody) {
        await a.agent.patch(`${base}/${resource.id}`).send(patchBody).expect(404);
      }
      await a.agent.delete(`${base}/${resource.id}`).expect(404);

      // Confirm none of those 404s mutated or removed B's row: it's still visible
      // in B's own list.
      const stillThere = await b.agent.get(base).expect(200);
      const list = Array.isArray(stillThere.body) ? stillThere.body : stillThere.body.items;
      expect(list.some((item: { identifier?: string; id?: string }) =>
        [item.identifier, item.id].includes(resource.id),
      )).toBe(true);
    });

    it(`${label}: another household's item never appears in the list`, async () => {
      await create();
      const res = await a.agent.get(base).expect(200);
      const list = Array.isArray(res.body) ? res.body : res.body.items;
      expect(list).toEqual([]);
    });
  }

  it("POST /api/meals 404s when recipeId belongs to another household", async () => {
    const foreignRecipe = await makeRecipe(b.household.id as string);
    await a.agent
      .post("/api/meals")
      .send({ date: "2026-02-01", mealType: "Dinner", recipeId: foreignRecipe.id })
      .expect(404);
  });

  it("PATCH /api/meals/:id 404s when swapping in another household's recipeId", async () => {
    const ownRecipe = await makeRecipe(a.household.id as string);
    const meal = await makeMeal(a.household.id as string, { recipeId: ownRecipe.id });
    const foreignRecipe = await makeRecipe(b.household.id as string);
    await a.agent
      .patch(`/api/meals/${meal.id}`)
      .send({ recipeId: foreignRecipe.id })
      .expect(404);
  });

  it("POST /api/shopping/from-recipe/:recipeId 404s for another household's recipe", async () => {
    const recipe = await makeRecipe(b.household.id as string, { recipeIngredient: ["Flour"] });
    await a.agent.post(`/api/shopping/from-recipe/${recipe.id}`).expect(404);
  });

  it("GET /api/recipes/search never returns another household's recipes", async () => {
    // Indexing only happens on the app's own write path (indexRecipe()), never for
    // factories.makeRecipe()'s direct Prisma writes — go through the API here.
    const bRes = await b.agent
      .post("/api/recipes")
      .send({ name: "Ratatouille Special" })
      .expect(201);
    await waitForIndexed(bRes.body.identifier);
    const aRes = await a.agent
      .post("/api/recipes")
      .send({ name: "Ratatouille For A" })
      .expect(201);
    await waitForIndexed(aRes.body.identifier);

    const res = await a.agent.get("/api/recipes/search").query({ q: "Ratatouille" }).expect(200);
    const ids = res.body.hits.map((hit: { identifier: string }) => hit.identifier);
    expect(ids).toContain(aRes.body.identifier);
    expect(ids).not.toContain(bRes.body.identifier);
  });

  it("GET /api/recipes/export only zips the caller's household's recipes", async () => {
    await makeRecipe(a.household.id as string, { name: "A's Recipe" });
    await makeRecipe(b.household.id as string, { name: "B's Recipe" });

    const res = await a.agent
      .get("/api/recipes/export")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const entries = unzipSync(new Uint8Array(res.body as Buffer));
    const names = Object.keys(entries);
    expect(names.some((name) => name.includes("a-s-recipe"))).toBe(true);
    expect(names.some((name) => name.includes("b-s-recipe"))).toBe(false);
    expect(names).toHaveLength(1);
  });
});

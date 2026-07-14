import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";
import { waitForIndexed, waitForRemoved } from "../helpers/search.js";

setUpClient();

describe("GET /api/recipes/search", () => {
  it("finds a created recipe by name and by ingredient", async () => {
    const user = await withHousehold();
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Miso Ramen", recipeIngredient: ["Miso paste", "Noodles"] })
      .expect(201);
    await waitForIndexed(created.body.identifier);

    const byName = await user.agent.get("/api/recipes/search").query({ q: "Ramen" }).expect(200);
    expect(byName.body.hits.map((h: { identifier: string }) => h.identifier)).toContain(
      created.body.identifier,
    );

    const byIngredient = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Miso paste" })
      .expect(200);
    expect(byIngredient.body.hits.map((h: { identifier: string }) => h.identifier)).toContain(
      created.body.identifier,
    );
  });

  it("the category filter works, and All means no filter", async () => {
    const user = await withHousehold();
    const soup = await user.agent
      .post("/api/recipes")
      .send({ name: "Category Soup", recipeCategory: "Soup" })
      .expect(201);
    const salad = await user.agent
      .post("/api/recipes")
      .send({ name: "Category Salad", recipeCategory: "Salad" })
      .expect(201);
    await waitForIndexed(soup.body.identifier);
    await waitForIndexed(salad.body.identifier);

    const soupOnly = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Category", category: "Soup" })
      .expect(200);
    const ids = soupOnly.body.hits.map((h: { identifier: string }) => h.identifier);
    expect(ids).toContain(soup.body.identifier);
    expect(ids).not.toContain(salad.body.identifier);

    const all = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Category", category: "All" })
      .expect(200);
    const allIds = all.body.hits.map((h: { identifier: string }) => h.identifier);
    expect(allIds).toContain(soup.body.identifier);
    expect(allIds).toContain(salad.body.identifier);
  });

  it("clamps limit to 1-100 and floors offset at 0", async () => {
    const user = await withHousehold();
    const created = await user.agent.post("/api/recipes").send({ name: "Clamp Test" }).expect(201);
    await waitForIndexed(created.body.identifier);

    const tooHigh = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Clamp", limit: 1000 })
      .expect(200);
    expect(tooHigh.body.limit).toBe(100);

    const tooLow = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Clamp", limit: 0 })
      .expect(200);
    expect(tooLow.body.limit).toBe(1);

    const negativeOffset = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Clamp", offset: -5 })
      .expect(200);
    expect(negativeOffset.body.offset).toBe(0);
  });

  it("a non-numeric limit or offset falls back to the default rather than passing NaN through", async () => {
    const user = await withHousehold();
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Non Numeric Params Soup" })
      .expect(201);
    await waitForIndexed(created.body.identifier);

    const res = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Non Numeric", limit: "abc", offset: "xyz" })
      .expect(200);
    // Number("abc") is NaN, which Number.isFinite rejects — the route must fall
    // back to searchRecipes' own defaults (limit 20, offset 0) instead of handing
    // Meilisearch a NaN.
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
  });

  it("a quote or backslash in the query doesn't break the Meili filter", async () => {
    const user = await withHousehold({ householdName: `Household "with" quotes` });
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Quoted Household Recipe" })
      .expect(201);
    await waitForIndexed(created.body.identifier);

    const res = await user.agent
      .get("/api/recipes/search")
      .query({ q: "Quoted", category: `Has "quote" \\ backslash` })
      .expect(200);
    // The category doesn't match, so zero hits — the point is that the request
    // itself doesn't 503 because the quote()-escaping in the filter is broken.
    expect(res.body.hits).toEqual([]);
  });

  it("deleting a recipe removes it from the index", async () => {
    const user = await withHousehold();
    const created = await user.agent
      .post("/api/recipes")
      .send({ name: "Ephemeral Recipe" })
      .expect(201);
    await waitForIndexed(created.body.identifier);

    await user.agent.delete(`/api/recipes/${created.body.identifier}`).expect(200);
    await waitForRemoved(created.body.identifier);

    const res = await user.agent.get("/api/recipes/search").query({ q: "Ephemeral" }).expect(200);
    expect(res.body.hits).toEqual([]);
  });
});

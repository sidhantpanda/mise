import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";
import { makeRecipe, makeShoppingItem } from "../helpers/factories.js";

setUpClient();

// POST /, PATCH /:id, and DELETE /:id had zero API-level coverage — every other
// test in this file seeds items via the makeShoppingItem factory, bypassing the
// routes entirely. Not in plans/testing-coverage.md's explicit A2 list, but a
// whole-handler gap in a file the plan targets is worth closing.
describe("POST /api/shopping", () => {
  it("creates an item from a flat body", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .post("/api/shopping")
      .send({ name: "Olive Oil", quantity: "1 bottle", category: "Pantry" })
      .expect(201);

    expect(res.body.name).toBe("Olive Oil");
    expect(res.body.quantity).toBe("1 bottle");
    expect(res.body.checked).toBe(false);
  });
});

describe("PATCH /api/shopping/:id", () => {
  it("updates the given fields and leaves others intact", async () => {
    const user = await withHousehold();
    const item = await makeShoppingItem(user.household.id as string, {
      name: "Original",
      checked: false,
    });

    const res = await user.agent
      .patch(`/api/shopping/${item.id}`)
      .send({ checked: true })
      .expect(200);

    expect(res.body.checked).toBe(true);
    expect(res.body.name).toBe("Original");
  });

  it("404s for an id in another household", async () => {
    const user = await withHousehold();
    const other = await withHousehold();
    const item = await makeShoppingItem(other.household.id as string);

    await user.agent.patch(`/api/shopping/${item.id}`).send({ checked: true }).expect(404);
  });
});

describe("DELETE /api/shopping/:id", () => {
  it("removes the item", async () => {
    const user = await withHousehold();
    const item = await makeShoppingItem(user.household.id as string);

    await user.agent.delete(`/api/shopping/${item.id}`).expect(200);

    const remaining = await user.agent.get("/api/shopping").expect(200);
    expect(remaining.body.find((i: { id: string }) => i.id === item.id)).toBeUndefined();
  });

  it("404s for an id in another household", async () => {
    const user = await withHousehold();
    const other = await withHousehold();
    const item = await makeShoppingItem(other.household.id as string);

    await user.agent.delete(`/api/shopping/${item.id}`).expect(404);
  });
});

describe("POST /api/shopping/from-recipe/:recipeId", () => {
  it("skips ingredients already on the list, case-insensitively", async () => {
    const user = await withHousehold();
    await makeShoppingItem(user.household.id as string, { name: "SALT" });
    const recipe = await makeRecipe(user.household.id as string, {
      recipeIngredient: ["Salt", "Pepper"],
    });

    const res = await user.agent
      .post(`/api/shopping/from-recipe/${recipe.id}`)
      .expect(200);

    expect(res.body.added).toBe(1);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toContain("Pepper");
    expect(names.filter((n: string) => n.toLowerCase() === "salt")).toHaveLength(1);
  });

  it("404s for another household's recipe", async () => {
    const user = await withHousehold();
    const other = await withHousehold();
    const recipe = await makeRecipe(other.household.id as string);
    await user.agent.post(`/api/shopping/from-recipe/${recipe.id}`).expect(404);
  });

  it("a recipe with zero ingredients adds nothing, rather than an empty createMany erroring", async () => {
    const user = await withHousehold();
    const recipe = await makeRecipe(user.household.id as string, { recipeIngredient: [] });

    const res = await user.agent.post(`/api/shopping/from-recipe/${recipe.id}`).expect(200);

    expect(res.body.added).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("POST /api/shopping/clear-checked", () => {
  it("removes only checked items", async () => {
    const user = await withHousehold();
    await makeShoppingItem(user.household.id as string, { name: "Checked", checked: true });
    await makeShoppingItem(user.household.id as string, { name: "Unchecked", checked: false });

    const res = await user.agent.post("/api/shopping/clear-checked").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Unchecked");
  });
});

describe("PATCH /api/shopping", () => {
  it("bulk-updates the checked state of the given ids", async () => {
    const user = await withHousehold();
    const a = await makeShoppingItem(user.household.id as string);
    const b = await makeShoppingItem(user.household.id as string);

    const res = await user.agent
      .patch("/api/shopping")
      .send({ ids: [a.id, b.id], checked: true })
      .expect(200);

    expect(res.body.every((i: { checked: boolean }) => i.checked)).toBe(true);
  });

  it("404s when none of the ids match the caller's household", async () => {
    const user = await withHousehold();
    await user.agent.patch("/api/shopping").send({ ids: ["nonexistent"], checked: true }).expect(404);
  });
});

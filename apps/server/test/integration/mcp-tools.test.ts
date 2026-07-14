import { describe, expect, it } from "vitest";
import { bearer, getApp, setUpClient } from "../helpers/client.js";
import { makeMeal, makeRecipe, makePantryItem, makeShoppingItem } from "../helpers/factories.js";
import { callMcpTool, toolJson, toolText } from "../helpers/mcp.js";
import { waitForIndexed } from "../helpers/search.js";
import { prisma } from "../../src/prisma.js";

setUpClient();

// Extends mcp.test.ts: every tool's happy path asserted against its parsed JSON
// payload (not just "didn't error"), plus the per-tool edges round 1 skipped.
// mcp.test.ts already covers create_recipe, search_recipes, add_meal_to_plan,
// add_to_shopping_list, add_pantry_items, list_households, set_default_household,
// get_meal_plan tenancy, the tool() error funnel, and bad-date input validation —
// this file does not repeat those.

describe("get_recipe", () => {
  it("happy path returns the full recipe DTO", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId, {
      name: "Detailed Soup",
      recipeIngredient: ["Carrot", "Stock"],
    });
    const res = await callMcpTool(getApp(), token, "get_recipe", { recipeId: recipe.id });
    expect(res.result?.isError).toBeFalsy();
    const dto = toolJson<{ identifier: string; name: string; recipeIngredient: string[] }>(res);
    expect(dto.identifier).toBe(recipe.id);
    expect(dto.name).toBe("Detailed Soup");
    expect(dto.recipeIngredient).toEqual(["Carrot", "Stock"]);
  });

  it("an unknown recipe id is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "get_recipe", { recipeId: "nonexistent" });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no recipe with that id/i);
  });
});

describe("list_recipes", () => {
  it("happy path pages through the household's recipes", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makeRecipe(householdId, { name: "List Recipe A" });
    await makeRecipe(householdId, { name: "List Recipe B" });

    const res = await callMcpTool(getApp(), token, "list_recipes", { limit: 1, offset: 0 });
    const parsed = toolJson<{ total: number; offset: number; count: number; recipes: unknown[] }>(
      res,
    );
    expect(parsed.total).toBe(2);
    expect(parsed.count).toBe(1);
    expect(parsed.offset).toBe(0);
    expect(parsed.recipes).toHaveLength(1);
  });
});

describe("get_meal_plan edges", () => {
  it("rejects an endDate before startDate", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "get_meal_plan", {
      startDate: "2026-03-10",
      endDate: "2026-03-01",
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/endDate must not be before startDate/i);
  });

  it("omitting endDate returns a single-day range", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    await makeMeal(householdId, { date: "2026-03-05", recipeId: recipe.id });
    const res = await callMcpTool(getApp(), token, "get_meal_plan", { startDate: "2026-03-05" });
    const parsed = toolJson<{ startDate: string; endDate: string; meals: unknown[] }>(res);
    expect(parsed.startDate).toBe("2026-03-05");
    expect(parsed.endDate).toBe("2026-03-05");
    expect(parsed.meals).toHaveLength(1);
  });

  it("nulls the recipe when it's been deleted (recipeId is SetNull)", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    const meal = await makeMeal(householdId, { date: "2026-03-06", recipeId: recipe.id });
    // Deleting the recipe directly (bypassing the route's transaction that also
    // removes planned meals) leaves the meal row with recipeId set to null by the
    // FK's onDelete: SetNull, same as a recipe deleted through any other path.
    await prisma.recipe.delete({ where: { id: recipe.id } });

    const res = await callMcpTool(getApp(), token, "get_meal_plan", { startDate: "2026-03-06" });
    const parsed = toolJson<{ meals: { identifier: string; recipe: unknown }[] }>(res);
    const planned = parsed.meals.find((m) => m.identifier === meal.id);
    expect(planned?.recipe).toBeNull();
  });
});

describe("update_planned_meal", () => {
  it("happy path returns the updated meal", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    const meal = await makeMeal(householdId, { date: "2026-03-07", recipeId: recipe.id });

    const res = await callMcpTool(getApp(), token, "update_planned_meal", {
      mealId: meal.id,
      servings: 6,
      mealType: "Lunch",
    });
    const parsed = toolJson<{ updated: { servings: number; mealType: string } }>(res);
    expect(parsed.updated.servings).toBe(6);
    expect(parsed.updated.mealType).toBe("Lunch");
  });

  it("an unknown meal id is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "update_planned_meal", {
      mealId: "nonexistent",
      servings: 2,
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no planned meal with that id/i);
  });

  it("a meal id belonging to another household is treated the same as unknown", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const foreign = await bearer({ scopes: ["read", "write"] });
    const foreignRecipe = await makeRecipe(foreign.householdId);
    const foreignMeal = await makeMeal(foreign.householdId, { recipeId: foreignRecipe.id });

    const res = await callMcpTool(getApp(), token, "update_planned_meal", {
      mealId: foreignMeal.id,
      servings: 2,
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no planned meal with that id/i);
  });

  it("swapping in a recipe id from another household is rejected", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    const meal = await makeMeal(householdId, { recipeId: recipe.id });
    const foreign = await bearer({ scopes: ["read", "write"] });
    const foreignRecipe = await makeRecipe(foreign.householdId);

    const res = await callMcpTool(getApp(), token, "update_planned_meal", {
      mealId: meal.id,
      recipeId: foreignRecipe.id,
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no recipe with that id/i);
  });
});

describe("remove_meal_from_plan", () => {
  it("happy path removes the meal", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    const meal = await makeMeal(householdId, { recipeId: recipe.id });

    const res = await callMcpTool(getApp(), token, "remove_meal_from_plan", { mealId: meal.id });
    expect(res.result?.isError).toBeFalsy();
    const remaining = await prisma.plannedMeal.findUnique({ where: { id: meal.id } });
    expect(remaining).toBeNull();
  });

  it("an unknown meal id is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "remove_meal_from_plan", {
      mealId: "nonexistent",
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no planned meal with that id/i);
  });
});

describe("get_shopping_list", () => {
  it("happy path excludes checked items by default and includes them when asked", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makeShoppingItem(householdId, { name: "Unchecked Item", checked: false });
    await makeShoppingItem(householdId, { name: "Checked Item", checked: true });

    const defaultRes = await callMcpTool(getApp(), token, "get_shopping_list", {});
    const defaultParsed = toolJson<{ count: number; items: { name: string }[] }>(defaultRes);
    expect(defaultParsed.count).toBe(1);
    expect(defaultParsed.items[0]?.name).toBe("Unchecked Item");

    const allRes = await callMcpTool(getApp(), token, "get_shopping_list", {
      includeChecked: true,
    });
    const allParsed = toolJson<{ count: number }>(allRes);
    expect(allParsed.count).toBe(2);
  });
});

describe("list_pantry", () => {
  it("happy path filters by location", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makePantryItem(householdId, { name: "Frozen Peas", location: "Freezer" });
    await makePantryItem(householdId, { name: "Canned Beans", location: "Pantry" });

    const res = await callMcpTool(getApp(), token, "list_pantry", { location: "Freezer" });
    const parsed = toolJson<{ count: number; items: { name: string }[] }>(res);
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]?.name).toBe("Frozen Peas");
  });
});

describe("remove_pantry_item", () => {
  it("removes by itemId", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const item = await makePantryItem(householdId, { name: "Old Rice" });
    const res = await callMcpTool(getApp(), token, "remove_pantry_item", { itemId: item.id });
    expect(res.result?.isError).toBeFalsy();
    expect(await prisma.pantryItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("removes by name when there's exactly one match", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makePantryItem(householdId, { name: "Unique Spice" });
    const res = await callMcpTool(getApp(), token, "remove_pantry_item", { name: "Unique Spice" });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("Unique Spice");
  });

  it("hands the choice back to the assistant when several items share a name", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makePantryItem(householdId, { name: "Salt", location: "Pantry" });
    await makePantryItem(householdId, { name: "Salt", location: "Fridge" });

    const res = await callMcpTool(getApp(), token, "remove_pantry_item", { name: "Salt" });
    // Not a tool error — a structured disambiguation payload the assistant can act on.
    expect(res.result?.isError).toBeFalsy();
    const parsed = toolJson<{ error: string; matches: unknown[] }>(res);
    expect(parsed.matches).toHaveLength(2);
  });

  it("an unknown itemId is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "remove_pantry_item", { itemId: "nope" });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no pantry item with that id/i);
  });

  it("an unknown name is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "remove_pantry_item", { name: "Ghost Pepper" });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/nothing called/i);
  });

  it("passing neither itemId nor name is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "remove_pantry_item", {});
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/pass either an itemid or a name/i);
  });
});

describe("create_recipe edges", () => {
  it("merges a schemaJson base under flat args, and flat args win", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "create_recipe", {
      name: "Flat Wins",
      recipeCategory: "Dinner",
      schemaJson: { "@type": "Recipe", name: "Base Name", recipeCuisine: "French" },
    });
    expect(res.result?.isError).toBeFalsy();

    const recipe = await prisma.recipe.findFirst({ where: { householdId, name: "Flat Wins" } });
    expect(recipe).not.toBeNull();
    expect(recipe?.recipeCuisine).toBe("French");
    expect(recipe?.recipeCategory).toBe("Dinner");
  });

  it("a body with no usable name surfaces the AppError(400) as a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "create_recipe", {
      description: "No name anywhere",
    });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/recipe name is required/i);
  });

  // Regression test for a real bug: create_recipe's inputSchema used to mark `name`
  // required, so the MCP SDK rejected a schemaJson-only body with a transport-level
  // -32602 error before it ever reached this handler — even though buildRecipeBody
  // (above) and createRecipe both know how to pull the name out of schemaJson. That
  // broke the "send this recipe to Mise" flow the README advertises, where a whole
  // Schema.org Recipe JSON-LD is handed over as schemaJson with no flat fields at
  // all. server.ts:190-193 now marks `name` .optional() at the schema level; this
  // pins that a schemaJson-only body (no top-level name) still succeeds and takes
  // its name from inside schemaJson.
  it("succeeds with only a schemaJson object and no top-level name", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "create_recipe", {
      schemaJson: {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Schema-Only Stew",
        recipeIngredient: ["Beef", "Carrots"],
      },
    });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("Schema-Only Stew");

    const recipe = await prisma.recipe.findFirst({
      where: { householdId, name: "Schema-Only Stew" },
    });
    expect(recipe).not.toBeNull();
    expect(recipe?.recipeIngredient).toEqual(["Beef", "Carrots"]);
  });
});

describe("search_recipes happy path (search enabled)", () => {
  it("returns matching recipes with the expected shape", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const created = await callMcpTool(getApp(), token, "create_recipe", {
      name: "Searchable Chowder",
      recipeCuisine: "New England",
    });
    const recipeId = toolText(created).match(/recipe id (\S+)\)/)?.[1];
    expect(recipeId).toBeTruthy();
    await waitForIndexed(recipeId!);

    const res = await callMcpTool(getApp(), token, "search_recipes", { query: "Chowder" });
    const parsed = toolJson<{ total: number; results: { id: string; name: string }[] }>(res);
    expect(parsed.results.some((r) => r.id === recipeId)).toBe(true);
  });
});

describe("resolveHousehold explicit own household", () => {
  it("passing the token's own householdId explicitly is accepted, same as omitting it", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId, { name: "Explicit Household Recipe" });
    const res = await callMcpTool(getApp(), token, "list_recipes", { householdId });
    const parsed = toolJson<{ recipes: { id: string }[] }>(res);
    expect(parsed.recipes.some((r) => r.id === recipe.id)).toBe(true);
  });
});

describe("ChatGPT connector: search", () => {
  it("returns documents shaped {id, title, url}", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const created = await callMcpTool(getApp(), token, "create_recipe", {
      name: "Connector Curry",
    });
    const recipeId = toolText(created).match(/recipe id (\S+)\)/)?.[1];
    await waitForIndexed(recipeId!);

    const res = await callMcpTool(getApp(), token, "search", { query: "Curry" });
    expect(res.result?.isError).toBeFalsy();
    const parsed = toolJson<{ results: { id: string; title: string; url: string }[] }>(res);
    const hit = parsed.results.find((r) => r.id === recipeId);
    expect(hit).toBeDefined();
    expect(hit?.title).toBe("Connector Curry");
    expect(hit?.url).toBe(`/recipes/${recipeId}`);
  });

  it("an empty query does not error", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makeRecipe(householdId, { name: "Empty Query Recipe" });
    const res = await callMcpTool(getApp(), token, "search", { query: "" });
    expect(res.result?.isError).toBeFalsy();
    const parsed = toolJson<{ results: unknown[] }>(res);
    expect(Array.isArray(parsed.results)).toBe(true);
  });
});

describe("ChatGPT connector: fetch", () => {
  it("returns the full recipe document by id", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId, {
      name: "Connector Fetch Recipe",
      recipeCuisine: "Thai",
    });

    const res = await callMcpTool(getApp(), token, "fetch", { id: recipe.id });
    expect(res.result?.isError).toBeFalsy();
    const parsed = toolJson<{
      id: string;
      title: string;
      text: string;
      url: string;
      metadata: { cuisine: string };
    }>(res);
    expect(parsed.id).toBe(recipe.id);
    expect(parsed.title).toBe("Connector Fetch Recipe");
    expect(parsed.url).toBe(`/recipes/${recipe.id}`);
    expect(parsed.metadata.cuisine).toBe("Thai");
    expect(JSON.parse(parsed.text).name).toBe("Connector Fetch Recipe");
  });

  it("an unknown id is a clean tool error", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callMcpTool(getApp(), token, "fetch", { id: "nonexistent" });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/no recipe with that id/i);
  });
});

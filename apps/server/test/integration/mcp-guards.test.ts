import { describe, expect, it } from "vitest";
import { bearer, getApp, setUpClient } from "../helpers/client.js";
import { addMember, makeUserWithHousehold } from "../helpers/factories.js";
import { callMcpTool, toolText } from "../helpers/mcp.js";

setUpClient();

// Table-driven security properties across every one of the 17 tools. mcp.test.ts
// already covers a subset of each table; this is the exhaustive version the plan
// calls for.

describe("scope enforcement: every write tool rejects a read-only token", () => {
  const cases: { name: string; args: Record<string, unknown> }[] = [
    { name: "create_recipe", args: { name: "Blocked Recipe" } },
    { name: "set_default_household", args: { householdId: "dummy-household-id" } },
    {
      name: "add_meal_to_plan",
      args: { date: "2026-01-01", mealType: "Dinner", recipeId: "dummy-recipe-id" },
    },
    { name: "update_planned_meal", args: { mealId: "dummy-meal-id", servings: 2 } },
    { name: "remove_meal_from_plan", args: { mealId: "dummy-meal-id" } },
    { name: "add_to_shopping_list", args: { items: [{ name: "Dummy item" }] } },
    { name: "add_pantry_items", args: { items: [{ name: "Dummy item" }] } },
    { name: "remove_pantry_item", args: { itemId: "dummy-item-id" } },
  ];

  it.each(cases)("$name returns a clean isError:true at HTTP 200, not a transport failure", async ({
    name,
    args,
  }) => {
    const { token } = await bearer({ scopes: ["read"] });
    const res = await callMcpTool(getApp(), token, name, args);
    expect(res.status).toBe(200);
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toMatch(/read-only/i);
  });
});

describe("set_default_household requires write scope", () => {
  // apps/server/src/mcp/server.ts:153 persists a real write
  // (prisma.accessToken.update) so it must be gated the same as every other write
  // tool, not just "read" — a read-only connection's whole point is that it can't
  // make changes, and this one otherwise repoints which household every future
  // call on the connection defaults to.
  it("a write-scoped token can still change the connection's default household", async () => {
    const { token, userId } = await bearer({ scopes: ["read", "write"] });
    const other = await makeUserWithHousehold();
    await addMember(other.household.id, userId);

    const res = await callMcpTool(getApp(), token, "set_default_household", {
      householdId: other.household.id,
    });

    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain(other.household.name);
  });
});

describe("cross-household refusal: every householdId-accepting tool rejects a foreign id", () => {
  const cases: { name: string; args: (foreignHouseholdId: string) => Record<string, unknown> }[] = [
    { name: "set_default_household", args: (id) => ({ householdId: id }) },
    { name: "create_recipe", args: (id) => ({ name: "X", householdId: id }) },
    { name: "search_recipes", args: (id) => ({ query: "x", householdId: id }) },
    { name: "get_recipe", args: (id) => ({ recipeId: "dummy-recipe-id", householdId: id }) },
    { name: "list_recipes", args: (id) => ({ householdId: id }) },
    { name: "get_meal_plan", args: (id) => ({ startDate: "2026-01-01", householdId: id }) },
    {
      name: "add_meal_to_plan",
      args: (id) => ({
        date: "2026-01-01",
        mealType: "Dinner",
        recipeId: "dummy-recipe-id",
        householdId: id,
      }),
    },
    {
      name: "update_planned_meal",
      args: (id) => ({ mealId: "dummy-meal-id", householdId: id }),
    },
    { name: "remove_meal_from_plan", args: (id) => ({ mealId: "dummy-meal-id", householdId: id }) },
    { name: "get_shopping_list", args: (id) => ({ householdId: id }) },
    {
      name: "add_to_shopping_list",
      args: (id) => ({ items: [{ name: "x" }], householdId: id }),
    },
    { name: "list_pantry", args: (id) => ({ householdId: id }) },
    {
      name: "add_pantry_items",
      args: (id) => ({ items: [{ name: "x" }], householdId: id }),
    },
    {
      name: "remove_pantry_item",
      args: (id) => ({ itemId: "dummy-item-id", householdId: id }),
    },
  ];

  it.each(cases)("$name refuses a householdId the caller isn't a member of", async ({
    name,
    args,
  }) => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const foreign = await makeUserWithHousehold();

    const res = await callMcpTool(getApp(), token, name, args(foreign.household.id));
    expect(res.result?.isError, `${name} should refuse a foreign householdId`).toBe(true);
    expect(toolText(res)).toMatch(/not a member/i);
  });
});

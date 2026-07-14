import { describe, expect, it, vi } from "vitest";
import { bearer, getApp, setUpClient } from "../helpers/client.js";
import { makeRecipe, makeUserWithHousehold } from "../helpers/factories.js";
import { parseMcpResponse, toolText } from "../helpers/mcp.js";

setUpClient();

async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const request = (await import("supertest")).default;
  const res = await request(getApp())
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return { status: res.status, ...parseMcpResponse(res) };
}

async function listTools(token: string) {
  const request = (await import("supertest")).default;
  const res = await request(getApp())
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  return parseMcpResponse(res);
}

describe("tools/list", () => {
  it("returns all 17 tools", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const parsed = await listTools(token);
    expect(parsed.result?.tools).toHaveLength(17);
  });
});

describe("per-tool happy paths", () => {
  it("create_recipe with flat args", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callTool(token, "create_recipe", { name: "MCP Recipe" });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("MCP Recipe");
  });

  it("create_recipe with a schemaJson base", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callTool(token, "create_recipe", {
      name: "Base Override",
      schemaJson: { "@type": "Recipe", name: "Base Name", recipeCuisine: "French" },
    });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("Base Override");
  });

  it("search_recipes", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await callTool(token, "create_recipe", { name: "Findable Soup" });
    const res = await callTool(token, "search_recipes", { query: "Findable" });
    expect(res.result?.isError).toBeFalsy();
    void householdId;
  });

  it("add_meal_to_plan", async () => {
    const { token, userId, householdId } = await bearer({ scopes: ["read", "write"] });
    void userId;
    const recipe = await makeRecipe(householdId);
    const res = await callTool(token, "add_meal_to_plan", {
      date: "2026-03-01",
      mealType: "Lunch",
      recipeId: recipe.id,
    });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain(recipe.name);
  });

  it("add_to_shopping_list", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callTool(token, "add_to_shopping_list", {
      items: [{ name: "Chickpeas" }],
    });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("Chickpeas");
  });

  it("add_pantry_items", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callTool(token, "add_pantry_items", {
      items: [{ name: "Lentils", quantity: 2, unit: "kg" }],
    });
    expect(res.result?.isError).toBeFalsy();
    expect(toolText(res)).toContain("Lentils");
  });

  it("list_households", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const res = await callTool(token, "list_households");
    expect(res.result?.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(res));
    expect(parsed.households).toHaveLength(1);
  });

  it("set_default_household", async () => {
    const { token, userId } = await bearer({ scopes: ["read", "write"] });
    const other = await makeUserWithHousehold();
    const { addMember } = await import("../helpers/factories.js");
    await addMember(other.household.id, userId);

    const res = await callTool(token, "set_default_household", { householdId: other.household.id });
    expect(res.result?.isError).toBeFalsy();
  });
});

describe("scope enforcement", () => {
  it("a write tool with a read-only token returns a clean tool error, not a transport failure", async () => {
    const { token } = await bearer({ scopes: ["read"] });
    const request = (await import("supertest")).default;
    const res = await request(getApp())
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_recipe", arguments: { name: "Blocked" } },
      });
    expect(res.status).toBe(200);
    const parsed = parseMcpResponse(res);
    expect(parsed.result?.isError).toBe(true);
    expect(toolText(parsed as never)).toMatch(/read-only/i);
  });
});

describe("cross-household refusal", () => {
  it("passing a householdId the user isn't a member of is refused on every tool that takes one", async () => {
    const { token } = await bearer({ scopes: ["read", "write"] });
    const foreign = await makeUserWithHousehold();

    for (const call of [
      { name: "search_recipes", args: { query: "x", householdId: foreign.household.id } },
      { name: "list_recipes", args: { householdId: foreign.household.id } },
      { name: "get_shopping_list", args: { householdId: foreign.household.id } },
      { name: "list_pantry", args: { householdId: foreign.household.id } },
    ]) {
      const res = await callTool(token, call.name, call.args);
      expect(res.result?.isError, `${call.name} should refuse a foreign householdId`).toBe(true);
      expect(toolText(res)).toMatch(/not a member/i);
    }
  });
});

describe("resolveHousehold default", () => {
  it("defaults to the token's household when householdId is omitted", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId, { name: "Default Household Recipe" });
    const res = await callTool(token, "list_recipes", {});
    const parsed = JSON.parse(toolText(res));
    expect(parsed.recipes.some((r: { id: string }) => r.id === recipe.id)).toBe(true);
  });
});

describe("get_meal_plan tenancy", () => {
  it("nulls out and never names a foreign recipe on a row written before the ownership check existed", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const foreign = await makeUserWithHousehold();
    const foreignRecipe = await makeRecipe(foreign.household.id, {
      name: "Foreign Household Recipe",
    });
    // Simulates a PlannedMeal written before the route enforced ownership — the
    // write path can no longer produce this row, but the read path must still
    // defend against one that predates the fix.
    const { prisma } = await import("../../src/prisma.js");
    const meal = await prisma.plannedMeal.create({
      data: {
        householdId,
        date: "2026-03-02",
        mealType: "Lunch",
        recipeId: foreignRecipe.id,
        servings: 1,
      },
    });

    const res = await callTool(token, "get_meal_plan", { startDate: "2026-03-02" });
    expect(res.result?.isError).toBeFalsy();
    const text = toolText(res);
    expect(text).not.toContain("Foreign Household Recipe");

    const parsed = JSON.parse(text);
    const planned = parsed.meals.find((m: { identifier: string }) => m.identifier === meal.id);
    expect(planned.recipe).toBeNull();
  });
});

describe("internal error handling", () => {
  it("converts an unexpected internal error to a generic message instead of leaking a stack trace", async () => {
    const { prisma } = await import("../../src/prisma.js");
    const spy = vi.spyOn(prisma.recipe, "findMany").mockRejectedValueOnce(new Error("boom: secret detail"));
    const { token } = await bearer({ scopes: ["read", "write"] });

    const res = await callTool(token, "list_recipes", {});
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toBe("Something went wrong in Mise. Try again.");
    expect(toolText(res)).not.toContain("boom");
    spy.mockRestore();
  });
});

describe("input validation", () => {
  it("rejects a non-ISO date for add_meal_to_plan", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    const recipe = await makeRecipe(householdId);
    const request = (await import("supertest")).default;
    const res = await request(getApp())
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "add_meal_to_plan",
          arguments: { date: "tomorrow", mealType: "Dinner", recipeId: recipe.id },
        },
      });
    const parsed = parseMcpResponse(res);
    // Zod input validation failures at the MCP layer surface as a JSON-RPC error
    // (invalid params), not a tool result.
    expect(parsed.result === undefined || parsed.result.isError).toBeTruthy();
  });
});

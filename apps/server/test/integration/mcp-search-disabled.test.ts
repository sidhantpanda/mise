import { describe, expect, it, vi } from "vitest";
import { bearer, getApp, setUpClient } from "../helpers/client.js";
import { makeRecipe } from "../helpers/factories.js";
import { callMcpTool, toolJson } from "../helpers/mcp.js";

// Same technique as search-disabled.test.ts: mock isSearchEnabled() to false so
// search_recipes falls back to its plain-Postgres path instead of throwing.
vi.mock("../../src/lib/recipeSearch.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/lib/recipeSearch.js")>(
      "../../src/lib/recipeSearch.js",
    );
  return { ...actual, isSearchEnabled: () => false };
});

setUpClient();

describe("search_recipes with search disabled", () => {
  it("reports the index is unavailable and matches on name only, instead of throwing", async () => {
    const { token, householdId } = await bearer({ scopes: ["read", "write"] });
    await makeRecipe(householdId, { name: "Fallback Findable Stew" });
    await makeRecipe(householdId, { name: "Irrelevant Dish" });

    const res = await callMcpTool(getApp(), token, "search_recipes", { query: "Findable" });
    expect(res.result?.isError).toBeFalsy();
    const parsed = toolJson<{ note: string; results: { name: string }[] }>(res);
    expect(parsed.note).toMatch(/search index unavailable/i);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.name).toBe("Fallback Findable Stew");
  });
});

import { describe, expect, it, vi } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

// Distinct from search-disabled.test.ts (isSearchEnabled() false, meaning
// Meilisearch was never configured). Here search is enabled but the query itself
// throws — e.g. Meilisearch is down or a network blip — which exercises the
// route's own try/catch around searchRecipes(), not the isSearchEnabled() guard.
// Module-mocked per file for the same reason search-disabled.test.ts is: this
// mock must not leak into other integration files sharing the run.
vi.mock("../../src/lib/recipeSearch.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/lib/recipeSearch.js")>(
      "../../src/lib/recipeSearch.js",
    );
  return {
    ...actual,
    isSearchEnabled: () => true,
    searchRecipes: async () => {
      throw new Error("Meilisearch connection refused");
    },
  };
});

setUpClient();

describe("GET /api/recipes/search when Meilisearch throws mid-search", () => {
  it("returns 503 'temporarily unavailable', distinct from the disabled-search 503", async () => {
    const user = await withHousehold();
    const res = await user.agent.get("/api/recipes/search").query({ q: "anything" }).expect(503);
    expect(res.body.error).toBe("Recipe search is temporarily unavailable");
  });
});

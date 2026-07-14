import { describe, expect, it, vi } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

// isSearchEnabled() is a plain function on lib/recipeSearch.js, not something the
// rest of the app can be told to ignore — mocking the module is the only way to
// exercise the "search unavailable" path without actually taking Meilisearch down
// for every other integration file sharing this run. Vitest gives this test file
// its own isolated module registry, so this mock is in effect for everything
// setUpClient()'s createApiApp() imports here, without affecting any other file.
vi.mock("../../src/lib/recipeSearch.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/lib/recipeSearch.js")>(
      "../../src/lib/recipeSearch.js",
    );
  return { ...actual, isSearchEnabled: () => false };
});

setUpClient();

describe("recipe search disabled", () => {
  it("GET /api/recipes/search returns 503", async () => {
    const user = await withHousehold();
    await user.agent.get("/api/recipes/search").expect(503);
  });

  it("recipe writes still succeed — indexing is best-effort and must never break a create", async () => {
    const user = await withHousehold();
    await user.agent.post("/api/recipes").send({ name: "Still Works" }).expect(201);
  });
});

import request from "supertest";
import type { Express } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uniqueEmail } from "../helpers/factories.js";

// publicLibrary.ts's list cache is a plain module-level variable (see
// lib/publicLibrary.ts), and the app under test is otherwise built once per file
// via helpers/client.ts's shared beforeAll — which would mean every test after
// the first sees a warm cache no matter what its own fetch mock returns. So this
// file deliberately does NOT use the shared client helper: each test rebuilds the
// app from scratch after vi.resetModules(), which re-evaluates lib/publicLibrary.ts
// (and therefore its cache) fresh.
async function freshAppWithHousehold(): Promise<{
  agent: ReturnType<typeof request.agent>;
  app: Express;
}> {
  vi.resetModules();
  const { createApiApp } = await import("../../src/app.js");
  const app = await createApiApp();
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "Test User", email: uniqueEmail(), password: "password123" })
    .expect(201);
  await agent.post("/api/households").send({ name: "Test Household", type: "Household" }).expect(201);
  return { agent, app };
}

// global.fetch is also how the meilisearch client makes its own HTTP calls, so a
// blanket vi.stubGlobal("fetch", ...) breaks index setup/writes as a side effect.
// This delegates anything that isn't the fake public-library host to the real
// fetch, and stubs it only for the duration of one test.
const realFetch = globalThis.fetch;
const LIBRARY_HOST = "example.invalid";

function stubLibraryFetch(handler: (url: string) => Promise<Response> | Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.includes(LIBRARY_HOST) ? handler(url) : realFetch(input, init);
    }),
  );
}

const INDEX = {
  all_recipes: [
    {
      name: "Public Pasta",
      time: "PT30M",
      cuisine: "Italian",
      meal_type: "Dinner",
      short_desc: "A simple pasta.",
      image_url: "https://example.test/pasta.jpg",
      file_location: "pasta.json",
    },
  ],
};

const RECIPE_JSON = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Public Pasta",
  recipeIngredient: ["Pasta", "Sauce"],
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/public-library", () => {
  it("caches the list for the module's lifetime — a second request doesn't re-fetch", async () => {
    const { agent } = await freshAppWithHousehold();
    const listFetch = vi.fn().mockResolvedValue(jsonResponse(INDEX));
    stubLibraryFetch(listFetch);

    await agent.get("/api/public-library").expect(200);
    await agent.get("/api/public-library").expect(200);

    expect(listFetch).toHaveBeenCalledTimes(1);
  });

  it("502s on a network failure", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch(() => Promise.reject(new Error("network down")));
    await agent.get("/api/public-library").expect(502);
  });

  it("502s on non-JSON", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response),
    );
    await agent.get("/api/public-library").expect(502);
  });

  it("502s on a malformed index", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch(() => Promise.resolve(jsonResponse({ not_the_right_shape: true })));
    await agent.get("/api/public-library").expect(502);
  });
});

describe("POST /api/public-library/import", () => {
  it("404s importing an id not in the index (the SSRF guard)", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch(() => Promise.resolve(jsonResponse(INDEX)));
    // A caller must not be able to make Mise fetch an arbitrary URL by passing an
    // id that was never vouched for by the library's own index.
    await agent
      .post("/api/public-library/import")
      .send({ id: "https://evil.example.test/x.json" })
      .expect(404);
  });

  it("imports a library recipe into the caller's household", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch((url) =>
      Promise.resolve(jsonResponse(url.includes("list.json") ? INDEX : RECIPE_JSON)),
    );

    const res = await agent.post("/api/public-library/import").send({ id: "pasta.json" }).expect(201);
    expect(res.body.recipe.name).toBe("Public Pasta");

    const list = await agent.get("/api/recipes").expect(200);
    expect(list.body.some((r: { name: string }) => r.name === "Public Pasta")).toBe(true);
  });

  it("502s when the index fetch succeeds but the recipe file fetch fails mid-import", async () => {
    const { agent } = await freshAppWithHousehold();
    // The id is vouched for by the index (so the SSRF guard passes), but the
    // second fetch — for the actual recipe JSON-LD — fails. This exercises
    // fetchJson's own try/catch independently of the list-load path already
    // covered by the GET /api/public-library 502 tests above.
    stubLibraryFetch((url) =>
      url.includes("list.json")
        ? Promise.resolve(jsonResponse(INDEX))
        : Promise.reject(new Error("network down")),
    );

    await agent.post("/api/public-library/import").send({ id: "pasta.json" }).expect(502);

    const list = await agent.get("/api/recipes").expect(200);
    expect(list.body).toEqual([]);
  });
});

// GET /api/public-library/recipe (the browse detail preview) had zero test
// coverage — not in plans/testing-coverage.md's explicit A2 list, but it's a real
// route with an untested 400 guard and an untested happy path, so it's covered
// here rather than left as a gap.
describe("GET /api/public-library/recipe", () => {
  it("400s when no id is given", async () => {
    const { agent } = await freshAppWithHousehold();
    await agent.get("/api/public-library/recipe").expect(400);
  });

  it("returns the recipe DTO for a valid library id without persisting it", async () => {
    const { agent } = await freshAppWithHousehold();
    stubLibraryFetch((url) =>
      Promise.resolve(jsonResponse(url.includes("list.json") ? INDEX : RECIPE_JSON)),
    );

    const res = await agent
      .get("/api/public-library/recipe")
      .query({ id: "pasta.json" })
      .expect(200);
    expect(res.body.name).toBe("Public Pasta");
    expect(res.body.recipeIngredient).toEqual(["Pasta", "Sauce"]);

    const list = await agent.get("/api/recipes").expect(200);
    expect(list.body).toEqual([]);
  });
});

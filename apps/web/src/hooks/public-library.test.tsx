import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../test/msw/handlers";
import { makeRecipeFixture } from "../../test/fixtures/recipe";
import { ApiError } from "@/lib/api";
import {
  publicRecipeLocation,
  publicRecipeSlug,
  usePublicLibrary,
  usePublicRecipe,
} from "./public-library";

let qc: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  qc.clear();
});

describe("publicRecipeSlug / publicRecipeLocation", () => {
  it("strip and re-add the fixed recipes/ prefix and .json suffix as exact inverses", () => {
    expect(publicRecipeSlug("recipes/miso-ramen.json")).toBe("miso-ramen");
    expect(publicRecipeLocation("miso-ramen")).toBe("recipes/miso-ramen.json");
    const location = "recipes/pad-thai.json";
    expect(publicRecipeLocation(publicRecipeSlug(location))).toBe(location);
  });

  it("round-trips an id that doesn't match the convention unchanged", () => {
    const slug = publicRecipeSlug("some-other-id");
    expect(publicRecipeLocation(slug)).toBe("recipes/some-other-id.json");
  });
});

describe("usePublicLibrary", () => {
  it("goes loading -> success with the fetched list", async () => {
    server.use(http.get("/api/public-library", () => HttpResponse.json([{ identifier: "p1" }])));

    const { result } = renderHook(() => usePublicLibrary(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ identifier: "p1" }]);
  });

  it("goes loading -> error on a server failure", async () => {
    server.use(
      http.get("/api/public-library", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    const { result } = renderHook(() => usePublicLibrary(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).message).toBe("boom");
  });
});

describe("usePublicRecipe", () => {
  it("fetches a single public recipe by id, url-encoding it in the query string", async () => {
    const recipe = makeRecipeFixture({ identifier: "recipes/miso ramen.json", name: "Miso Ramen" });
    server.use(
      http.get("/api/public-library/recipe", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("id")).toBe("recipes/miso ramen.json");
        return HttpResponse.json(recipe);
      }),
    );

    const { result } = renderHook(() => usePublicRecipe("recipes/miso ramen.json"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Miso Ramen");
  });

  it("stays disabled for an empty id", () => {
    server.use(
      http.get("/api/public-library/recipe", () => {
        throw new Error("should not be called for an empty id");
      }),
    );
    const { result } = renderHook(() => usePublicRecipe(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

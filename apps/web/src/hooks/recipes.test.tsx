import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../test/msw/handlers";
import { makeRecipeFixture } from "../../test/fixtures/recipe";
import { ApiError } from "@/lib/api";
import { useRecipe, useRecipes, useRecipeSearch } from "./recipes";

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

describe("useRecipes", () => {
  it("goes loading -> success with the fetched list", async () => {
    const recipes = [makeRecipeFixture({ identifier: "r1" })];
    server.use(http.get("/api/recipes", () => HttpResponse.json(recipes)));

    const { result } = renderHook(() => useRecipes(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(recipes);
  });

  it("goes loading -> error with an ApiError on a server failure", async () => {
    server.use(
      http.get("/api/recipes", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).message).toBe("boom");
  });
});

describe("useRecipe", () => {
  it("fetches a single recipe by id", async () => {
    const recipe = makeRecipeFixture({ identifier: "r1", name: "Ramen" });
    server.use(http.get("/api/recipes/r1", () => HttpResponse.json(recipe)));

    const { result } = renderHook(() => useRecipe("r1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Ramen");
  });

  it("stays disabled for an empty id, so no request is made", () => {
    server.use(
      http.get("/api/recipes/", () => {
        throw new Error("should not be called for an empty id");
      }),
    );
    const { result } = renderHook(() => useRecipe(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
  });
});

describe("useRecipeSearch", () => {
  it("stays disabled until the query is non-empty", () => {
    const { result } = renderHook(() => useRecipeSearch(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("paginates search results across pages", async () => {
    server.use(
      http.get("/api/recipes/search", ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset"));
        const hit = makeRecipeFixture({ identifier: `r${offset}` });
        return HttpResponse.json({ hits: [hit], total: 48, limit: 24, offset });
      }),
    );

    const { result } = renderHook(() => useRecipeSearch("ramen"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1].offset).toBe(24);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("surfaces a search error", async () => {
    server.use(
      http.get("/api/recipes/search", () =>
        HttpResponse.json({ error: "search unavailable" }, { status: 503 }),
      ),
    );
    const { result } = renderHook(() => useRecipeSearch("ramen"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).message).toBe("search unavailable");
  });
});

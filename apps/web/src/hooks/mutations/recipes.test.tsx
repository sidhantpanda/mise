import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import { useCreateRecipe, useDeleteRecipe, useUpdateRecipe, useUploadRecipes } from "./recipes";

let qc: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  qc.clear();
});

describe("useCreateRecipe", () => {
  it("invalidates the recipes list on success", async () => {
    server.use(
      http.post("/api/recipes", () =>
        HttpResponse.json({ identifier: "r1", name: "New" }, { status: 201 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateRecipe(), { wrapper });

    result.current.mutate({ name: "New" } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipes });
  });
});

describe("useUploadRecipes", () => {
  it("posts the file as multipart form data and invalidates the recipes list", async () => {
    let seenContentType: string | null = "unset";
    server.use(
      http.post("/api/recipes/upload", ({ request }) => {
        seenContentType = request.headers.get("content-type");
        return HttpResponse.json({ recipeCount: 2 });
      }),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUploadRecipes(), { wrapper });

    result.current.mutate(new File(["{}"], "recipe.json", { type: "application/json" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ recipeCount: 2 });
    // multipart/form-data with its boundary, never application/json — postForm
    // never sets a Content-Type header itself, so the browser/undici can add
    // the multipart boundary.
    expect(seenContentType).not.toContain("application/json");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipes });
  });

  it("does not invalidate anything when the upload fails", async () => {
    server.use(
      http.post("/api/recipes/upload", () =>
        HttpResponse.json({ error: "Unsupported file" }, { status: 400 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUploadRecipes(), { wrapper });

    result.current.mutate(new File(["x"], "bad.txt"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateRecipe", () => {
  it("invalidates both the list and the single-recipe cache", async () => {
    server.use(
      http.patch("/api/recipes/r1", () => HttpResponse.json({ identifier: "r1", name: "Renamed" })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateRecipe(), { wrapper });

    result.current.mutate({ id: "r1", patch: { name: "Renamed" } } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipes });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipe("r1") });
  });
});

describe("useDeleteRecipe", () => {
  it("invalidates recipes and meals (deleting a recipe drops its planned meals too)", async () => {
    server.use(http.delete("/api/recipes/r1", () => HttpResponse.json({ ok: true })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteRecipe(), { wrapper });

    result.current.mutate("r1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipes });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.meals });
  });

  it("does not invalidate anything on a failed request", async () => {
    server.use(
      http.delete("/api/recipes/r1", () => HttpResponse.json({ error: "nope" }, { status: 404 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteRecipe(), { wrapper });

    result.current.mutate("r1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

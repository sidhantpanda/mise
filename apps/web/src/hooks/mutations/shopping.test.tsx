import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import {
  useAddFromRecipe,
  useClearChecked,
  useCreateShopping,
  useDeleteShopping,
  useSetShoppingChecked,
  useUpdateShopping,
} from "./shopping";

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

describe("useCreateShopping", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(http.post("/api/shopping", () => HttpResponse.json({ id: "s1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateShopping(), { wrapper });

    result.current.mutate({ name: "Tomatoes" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.post("/api/shopping", () => HttpResponse.json({ error: "nope" }, { status: 400 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateShopping(), { wrapper });

    result.current.mutate({ name: "Tomatoes" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateShopping", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(http.patch("/api/shopping/s1", () => HttpResponse.json({ id: "s1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateShopping(), { wrapper });

    result.current.mutate({ id: "s1", patch: { quantity: "2" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });
});

describe("useDeleteShopping", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(http.delete("/api/shopping/s1", () => new HttpResponse(null, { status: 204 })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteShopping(), { wrapper });

    result.current.mutate("s1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });
});

describe("useClearChecked", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(http.post("/api/shopping/clear-checked", () => HttpResponse.json([])));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useClearChecked(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });
});

describe("useSetShoppingChecked", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(http.patch("/api/shopping", () => HttpResponse.json([])));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetShoppingChecked(), { wrapper });

    result.current.mutate({ ids: ["s1", "s2"], checked: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });
});

describe("useAddFromRecipe", () => {
  it("invalidates the shopping list on success", async () => {
    server.use(
      http.post("/api/shopping/from-recipe/r1", () => HttpResponse.json({ added: 3, items: [] })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddFromRecipe(), { wrapper });

    result.current.mutate("r1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.shopping });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.post("/api/shopping/from-recipe/r1", () =>
        HttpResponse.json({ error: "no ingredients" }, { status: 400 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddFromRecipe(), { wrapper });

    result.current.mutate("r1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

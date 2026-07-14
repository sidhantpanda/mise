import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import { useCreateMeal, useDeleteMeal, useUpdateMeal } from "./meals";

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

describe("useCreateMeal", () => {
  it("invalidates the meals list on success", async () => {
    server.use(http.post("/api/meals", () => HttpResponse.json({ identifier: "m1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateMeal(), { wrapper });

    result.current.mutate({
      date: "2026-07-14",
      mealType: "Dinner",
      recipeId: "r1",
      servings: 2,
    } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.meals });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.post("/api/meals", () => HttpResponse.json({ error: "nope" }, { status: 400 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateMeal(), { wrapper });

    result.current.mutate({
      date: "2026-07-14",
      mealType: "Dinner",
      recipeId: "r1",
      servings: 2,
    } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateMeal", () => {
  it("invalidates the meals list on success", async () => {
    server.use(
      http.patch("/api/meals/m1", () => HttpResponse.json({ identifier: "m1", servings: 4 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateMeal(), { wrapper });

    result.current.mutate({ id: "m1", patch: { servings: 4 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.meals });
  });
});

describe("useDeleteMeal", () => {
  it("invalidates the meals list on success", async () => {
    server.use(http.delete("/api/meals/m1", () => new HttpResponse(null, { status: 204 })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMeal(), { wrapper });

    result.current.mutate("m1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.meals });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.delete("/api/meals/m1", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMeal(), { wrapper });

    result.current.mutate("m1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

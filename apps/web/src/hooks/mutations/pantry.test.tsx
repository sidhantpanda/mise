import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import { useCreatePantry, useDeletePantry, useUpdatePantry } from "./pantry";

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

const pantryInput = {
  name: "Olive oil",
  category: "Pantry",
  quantity: { "@type": "QuantitativeValue" as const, value: 1, unitText: "bottle" },
  location: "Pantry" as const,
};

describe("useCreatePantry", () => {
  it("invalidates the pantry list on success", async () => {
    server.use(http.post("/api/pantry", () => HttpResponse.json({ identifier: "p1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreatePantry(), { wrapper });

    result.current.mutate(pantryInput);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.pantry });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.post("/api/pantry", () => HttpResponse.json({ error: "nope" }, { status: 400 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreatePantry(), { wrapper });

    result.current.mutate(pantryInput);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdatePantry", () => {
  it("invalidates the pantry list on success", async () => {
    server.use(http.patch("/api/pantry/p1", () => HttpResponse.json({ identifier: "p1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdatePantry(), { wrapper });

    result.current.mutate({ id: "p1", patch: { name: "Sesame oil" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.pantry });
  });
});

describe("useDeletePantry", () => {
  it("invalidates the pantry list on success", async () => {
    server.use(http.delete("/api/pantry/p1", () => new HttpResponse(null, { status: 204 })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeletePantry(), { wrapper });

    result.current.mutate("p1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.pantry });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.delete("/api/pantry/p1", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeletePantry(), { wrapper });

    result.current.mutate("p1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import { useImportPublicRecipe } from "./public-library";

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

describe("useImportPublicRecipe", () => {
  it("invalidates the user's recipe list, not the public library, on success", async () => {
    server.use(
      http.post("/api/public-library/import", () =>
        HttpResponse.json({ identifier: "r1", name: "Imported" }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useImportPublicRecipe(), { wrapper });

    result.current.mutate("public-recipe-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.recipes });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: keys.publicLibrary });
  });

  it("does not invalidate anything on error", async () => {
    server.use(
      http.post("/api/public-library/import", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useImportPublicRecipe(), { wrapper });

    result.current.mutate("missing");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

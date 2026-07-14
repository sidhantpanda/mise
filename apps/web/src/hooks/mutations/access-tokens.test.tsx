import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys } from "../keys";
import { useCreateAccessToken, useRevokeAccessToken } from "./access-tokens";

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

describe("useCreateAccessToken", () => {
  it("invalidates the access-tokens list on success", async () => {
    server.use(
      http.post("/api/auth/tokens", () =>
        HttpResponse.json({ id: "t1", token: "raw-token" }, { status: 201 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateAccessToken(), { wrapper });

    result.current.mutate({ name: "Bot", scopes: ["read"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.accessTokens });
  });

  it("does not invalidate anything on a failed request", async () => {
    server.use(
      http.post("/api/auth/tokens", () =>
        HttpResponse.json({ error: "Invalid scope" }, { status: 400 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateAccessToken(), { wrapper });

    result.current.mutate({ name: "Bot", scopes: ["bogus"] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useRevokeAccessToken", () => {
  it("invalidates the access-tokens list on success", async () => {
    server.use(http.delete("/api/auth/tokens/t1", () => new HttpResponse(null, { status: 204 })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRevokeAccessToken(), { wrapper });

    result.current.mutate("t1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.accessTokens });
  });

  it("does not invalidate anything on a failed request", async () => {
    server.use(
      http.delete("/api/auth/tokens/t1", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRevokeAccessToken(), { wrapper });

    result.current.mutate("t1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

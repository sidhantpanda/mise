import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { keys, meKey } from "../keys";
import { useInvite, useRevokeInvite, useUpdateHousehold } from "./household";

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

describe("useInvite", () => {
  it("writes the updated household straight into the cache", async () => {
    server.use(
      http.post("/api/household/invitations", () =>
        HttpResponse.json({ id: "h1", name: "Kitchen" }),
      ),
    );
    const { result } = renderHook(() => useInvite(), { wrapper });

    result.current.mutate({ email: "friend@example.com" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(keys.household)).toEqual({ id: "h1", name: "Kitchen" });
  });

  it("leaves the household cache alone on error", async () => {
    server.use(
      http.post("/api/household/invitations", () =>
        HttpResponse.json({ error: "already a member" }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useInvite(), { wrapper });

    result.current.mutate({ email: "friend@example.com" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(keys.household)).toBeUndefined();
  });
});

describe("useRevokeInvite", () => {
  it("writes the updated household straight into the cache", async () => {
    server.use(
      http.delete("/api/household/invitations/inv1", () =>
        HttpResponse.json({ id: "h1", name: "Kitchen" }),
      ),
    );
    const { result } = renderHook(() => useRevokeInvite(), { wrapper });

    result.current.mutate("inv1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(keys.household)).toEqual({ id: "h1", name: "Kitchen" });
  });
});

describe("useUpdateHousehold", () => {
  it("writes the household cache and invalidates me (sidebar reads household off it)", async () => {
    server.use(
      http.patch("/api/household", () => HttpResponse.json({ id: "h1", name: "Renamed" })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    result.current.mutate({ name: "Renamed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(keys.household)).toEqual({ id: "h1", name: "Renamed" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: meKey });
  });

  it("does not touch the cache on error", async () => {
    server.use(
      http.patch("/api/household", () => HttpResponse.json({ error: "nope" }, { status: 400 })),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    result.current.mutate({ name: "Renamed" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(keys.household)).toBeUndefined();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

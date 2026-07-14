import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../test/msw/handlers";
import { meKey } from "../keys";
import {
  useAcceptInvitation,
  useCreateHousehold,
  useLogin,
  useLogout,
  useRejectInvitation,
  useSignup,
  useSwitchHousehold,
} from "./auth";

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

describe("useLogin", () => {
  it("seeds the me cache with the session on success", async () => {
    server.use(http.post("/api/auth/login", () => HttpResponse.json({ id: "u1", name: "Ava" })));
    const { result } = renderHook(() => useLogin(), { wrapper });

    result.current.mutate({ email: "ava@example.com", password: "hunter2" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(meKey)).toEqual({ id: "u1", name: "Ava" });
  });

  it("leaves the me cache alone on invalid credentials", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      ),
    );
    const { result } = renderHook(() => useLogin(), { wrapper });

    result.current.mutate({ email: "ava@example.com", password: "wrong" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(meKey)).toBeUndefined();
  });
});

describe("useSignup", () => {
  it("seeds the me cache on success", async () => {
    server.use(http.post("/api/auth/signup", () => HttpResponse.json({ id: "u2", name: "Bo" })));
    const { result } = renderHook(() => useSignup(), { wrapper });

    result.current.mutate({ name: "Bo", email: "bo@example.com", password: "hunter22" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(meKey)).toEqual({ id: "u2", name: "Bo" });
  });
});

describe("useLogout", () => {
  it("clears the entire cache on success", async () => {
    server.use(http.post("/api/auth/logout", () => HttpResponse.json({ ok: true })));
    qc.setQueryData(meKey, { id: "u1" });
    const clearSpy = vi.spyOn(qc, "clear");
    const { result } = renderHook(() => useLogout(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe("useCreateHousehold / useSwitchHousehold / useAcceptInvitation", () => {
  it("useCreateHousehold invalidates the entire cache (every household-scoped query is stale)", async () => {
    server.use(http.post("/api/households", () => HttpResponse.json({ id: "h1" })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateHousehold(), { wrapper });

    result.current.mutate({ name: "Kitchen", type: "Household" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it("useSwitchHousehold invalidates the entire cache", async () => {
    server.use(http.post("/api/households/active", () => HttpResponse.json({ ok: true })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSwitchHousehold(), { wrapper });

    result.current.mutate("h2");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it("useAcceptInvitation invalidates the entire cache", async () => {
    server.use(http.post("/api/invitations/inv1/accept", () => HttpResponse.json({ ok: true })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAcceptInvitation(), { wrapper });

    result.current.mutate("inv1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith();
  });
});

describe("useRejectInvitation", () => {
  it("invalidates only the me query, not the whole cache", async () => {
    server.use(http.post("/api/invitations/inv1/reject", () => HttpResponse.json({ ok: true })));
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRejectInvitation(), { wrapper });

    result.current.mutate("inv1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: meKey });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate anything on a failed request", async () => {
    server.use(
      http.post("/api/invitations/inv1/reject", () =>
        HttpResponse.json({ error: "already rejected" }, { status: 409 }),
      ),
    );
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRejectInvitation(), { wrapper });

    result.current.mutate("inv1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

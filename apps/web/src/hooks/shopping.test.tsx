import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../test/msw/handlers";
import { ApiError } from "@/lib/api";
import { useShopping } from "./shopping";

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

describe("useShopping", () => {
  it("goes loading -> success with the fetched list", async () => {
    server.use(http.get("/api/shopping", () => HttpResponse.json([{ id: "s1" }])));

    const { result } = renderHook(() => useShopping(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "s1" }]);
  });

  it("goes loading -> error on a server failure", async () => {
    server.use(
      http.get("/api/shopping", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    const { result } = renderHook(() => useShopping(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).message).toBe("boom");
  });
});

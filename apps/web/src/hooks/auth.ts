import { useQuery } from "@tanstack/react-query";
import type { Me } from "common";
import { api, ApiError } from "@/lib/api";
import { meKey } from "./keys";

/**
 * Current session. A 401 is an expected "logged out" state, so don't retry it -
 * callers branch on `isError` / `data`.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => api.get<Me>("/auth/me"),
    retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
    staleTime: 5 * 60 * 1000,
  });
}

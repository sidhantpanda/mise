import { useQuery } from "@tanstack/react-query";
import type { AccessToken } from "common";
import { api } from "@/lib/api";
import { keys } from "./keys";

export function useAccessTokens() {
  return useQuery({
    queryKey: keys.accessTokens,
    queryFn: () => api.get<AccessToken[]>("/auth/tokens"),
  });
}

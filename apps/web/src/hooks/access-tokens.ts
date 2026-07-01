import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";

export type AccessToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  household: { id: string; name: string };
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreatedAccessToken = AccessToken & { token: string };

export function useAccessTokens() {
  return useQuery({
    queryKey: keys.accessTokens,
    queryFn: () => api.get<AccessToken[]>("/auth/tokens"),
  });
}

import crypto from "node:crypto";

const TOKEN_PREFIX = "mise";

export function generateAccessToken() {
  return `${TOKEN_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenPrefix(token: string) {
  return token.slice(0, 16);
}

export function toAccessTokenDTO(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  household: { id: string; name: string };
}) {
  return {
    id: token.id,
    name: token.name,
    prefix: token.tokenPrefix,
    scopes: token.scopes,
    household: token.household,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

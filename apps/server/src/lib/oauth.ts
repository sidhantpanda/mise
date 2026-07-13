import crypto from "node:crypto";
import { env } from "../env.js";

// Mise acts as its own OAuth 2.1 authorization server so MCP clients (Claude,
// ChatGPT) can offer a one-click "Connect" button instead of asking the user to
// paste an access token. This module holds the primitives; routes/oauth.ts is the
// protocol surface.
//
// The issuer is WEB_ORIGIN — the public URL users reach Mise at. Clients discover
// every endpoint from the metadata documents below, so nothing else is configured.

export const OAUTH_SCOPES = ["read", "write"] as const;

// OAuth-issued access tokens are short-lived and renewed with a rotating refresh
// token, so a leaked access token expires on its own and a stolen refresh token is
// invalidated the first time either party uses it.
export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60; // 5 minutes

export function issuer(): string {
  return env.WEB_ORIGIN.replace(/\/$/, "");
}

export function resourceUrl(): string {
  return `${issuer()}/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${issuer()}/.well-known/oauth-protected-resource`;
}

// RFC 8414 — tells the client where to register, authorize, and get tokens.
export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // OAuth 2.1 requires PKCE; S256 only (never "plain").
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    service_documentation: "https://github.com/sidhantpanda/mise/blob/main/docs/mcp.md",
  };
}

// RFC 9728 — the /mcp endpoint advertises this from its 401 so a client can find
// the authorization server without being told about it out of band.
export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/sidhantpanda/mise/blob/main/docs/mcp.md",
  };
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// PKCE (RFC 7636, S256): the client sent us `code_challenge` = BASE64URL(SHA256(verifier))
// when it started the flow, and proves possession with the raw verifier at the token
// endpoint. Compared in constant time.
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Redirect URIs must match a registered one exactly (no prefix/wildcard matching —
// that's how open redirects get built).
export function isRegisteredRedirectUri(uri: string, registered: string[]): boolean {
  return registered.includes(uri);
}

// A client may only register redirects we can hand a code to safely: HTTPS, or a
// loopback address (native apps and local MCP clients) which is exempt by RFC 8252.
export function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false;
  if (parsed.protocol === "https:") return true;
  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  );
}

// Requested scopes are intersected with what the client registered for, so a client
// can never widen its grant at authorize time.
export function parseScopes(requested: string | undefined, allowed: string[]): string[] {
  const list = (requested ?? "").split(/\s+/).filter(Boolean);
  const candidates = list.length > 0 ? list : allowed;
  const granted = candidates.filter((scope) => allowed.includes(scope));
  return [...new Set(granted)];
}

// Build the client's redirect back, preserving `state` (its CSRF token).
export function redirectWith(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

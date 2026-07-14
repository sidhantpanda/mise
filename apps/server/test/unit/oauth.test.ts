import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// oauth.ts reads `env.WEB_ORIGIN` live (not destructured at import time), so
// mutating this mock object between tests changes what issuer()/metadata see —
// no vi.resetModules() dance needed.
const mockEnv = { WEB_ORIGIN: "http://localhost:3000" };
vi.mock("../../src/env.js", () => ({ env: mockEnv }));

const {
  authorizationServerMetadata,
  constantTimeEquals,
  isAllowedRedirectUri,
  isRegisteredRedirectUri,
  issuer,
  parseScopes,
  protectedResourceMetadata,
  redirectWith,
  verifyPkce,
} = await import("../../src/lib/oauth.js");

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

beforeEach(() => {
  mockEnv.WEB_ORIGIN = "http://localhost:3000";
});

describe("verifyPkce", () => {
  it("passes for a correct S256 verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("fails for a wrong verifier", () => {
    const { challenge } = pkcePair();
    expect(verifyPkce("wrong-verifier", challenge)).toBe(false);
  });

  it("fails without throwing when the challenge length differs", () => {
    // timingSafeEqual throws on unequal buffer lengths — the length guard in
    // verifyPkce exists specifically to avoid that throw.
    expect(() => verifyPkce("some-verifier", "short")).not.toThrow();
    expect(verifyPkce("some-verifier", "short")).toBe(false);
  });
});

describe("constantTimeEquals", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEquals("abc", "abd")).toBe(false);
  });

  it("returns false for different lengths without throwing", () => {
    expect(() => constantTimeEquals("abc", "abcdef")).not.toThrow();
    expect(constantTimeEquals("abc", "abcdef")).toBe(false);
  });
});

describe("isAllowedRedirectUri", () => {
  it.each([
    ["https://x.com/cb", true],
    ["http://localhost:1234/cb", true],
    ["http://127.0.0.1/cb", true],
    ["http://evil.com/cb", false],
    ["https://x.com/cb#fragment", false],
    ["javascript:alert(1)", false],
    ["not a url at all", false],
    // Hostname is compared exactly — a subdomain of localhost is not localhost.
    ["http://localhost.evil.com/cb", false],
  ])("%s -> %s", (uri, expected) => {
    expect(isAllowedRedirectUri(uri)).toBe(expected);
  });
});

describe("isRegisteredRedirectUri", () => {
  it("matches exactly", () => {
    expect(isRegisteredRedirectUri("https://x.com/cb", ["https://x.com/cb"])).toBe(true);
  });

  it("rejects a prefix of a registered URI", () => {
    expect(isRegisteredRedirectUri("https://x.com/cb/../evil", ["https://x.com/cb"])).toBe(false);
  });

  it("rejects an unregistered URI", () => {
    expect(isRegisteredRedirectUri("https://y.com/cb", ["https://x.com/cb"])).toBe(false);
  });
});

describe("parseScopes", () => {
  it("intersects requested scopes with the client's allowed scopes", () => {
    expect(parseScopes("read write admin", ["read", "write"])).toEqual(["read", "write"]);
  });

  it("falls back to all allowed scopes when the request is empty", () => {
    expect(parseScopes(undefined, ["read", "write"])).toEqual(["read", "write"]);
    expect(parseScopes("", ["read", "write"])).toEqual(["read", "write"]);
  });

  it("dedupes", () => {
    expect(parseScopes("read read write", ["read", "write"])).toEqual(["read", "write"]);
  });

  it("drops unknown scopes", () => {
    expect(parseScopes("admin superuser", ["read", "write"])).toEqual([]);
  });

  it("never widens a client's grant beyond what it's allowed", () => {
    expect(parseScopes("read write", ["read"])).toEqual(["read"]);
  });
});

describe("redirectWith", () => {
  it("preserves state", () => {
    const url = redirectWith("https://x.com/cb", { state: "abc123" });
    expect(new URL(url).searchParams.get("state")).toBe("abc123");
  });

  it("skips undefined params", () => {
    const url = redirectWith("https://x.com/cb", { code: "c1", state: undefined });
    expect(new URL(url).searchParams.has("state")).toBe(false);
    expect(new URL(url).searchParams.get("code")).toBe("c1");
  });

  it("preserves an existing query string on the redirect URI", () => {
    const url = redirectWith("https://x.com/cb?foo=bar", { code: "c1" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("foo")).toBe("bar");
    expect(parsed.searchParams.get("code")).toBe("c1");
  });
});

describe("authorizationServerMetadata / protectedResourceMetadata", () => {
  it("issuer has no trailing slash even when WEB_ORIGIN has one", () => {
    mockEnv.WEB_ORIGIN = "https://mise.example.com/";
    expect(authorizationServerMetadata().issuer).toBe("https://mise.example.com");
    expect(issuer()).toBe("https://mise.example.com");
  });

  it("code_challenge_methods_supported is exactly [S256], never plain", () => {
    expect(authorizationServerMetadata().code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("protectedResourceMetadata's resource is built from the issuer", () => {
    mockEnv.WEB_ORIGIN = "https://mise.example.com";
    expect(protectedResourceMetadata().resource).toBe("https://mise.example.com/mcp");
    expect(protectedResourceMetadata().authorization_servers).toEqual([
      "https://mise.example.com",
    ]);
  });
});

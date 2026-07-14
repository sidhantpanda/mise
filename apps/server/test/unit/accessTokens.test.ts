import { describe, expect, it } from "vitest";
import {
  generateAccessToken,
  hashAccessToken,
  tokenPrefix,
  toAccessTokenDTO,
} from "../../src/lib/accessTokens.js";

describe("generateAccessToken", () => {
  it("is mise_-prefixed", () => {
    expect(generateAccessToken()).toMatch(/^mise_/);
  });

  it("never collides across two calls", () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken());
  });
});

describe("hashAccessToken", () => {
  it("is a stable SHA-256 hex digest", () => {
    const token = "mise_abc123";
    const hash = hashAccessToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken(token)).toBe(hash);
  });
});

describe("tokenPrefix", () => {
  it("is the first 16 characters", () => {
    const token = "mise_0123456789abcdefghijklmnop";
    expect(tokenPrefix(token)).toBe(token.slice(0, 16));
    expect(tokenPrefix(token)).toHaveLength(16);
  });
});

describe("toAccessTokenDTO", () => {
  const base = {
    id: "t1",
    name: "My token",
    tokenPrefix: "mise_012345678",
    scopes: ["read"],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    household: { id: "h1", name: "Home" },
  };

  it("maps nulls to null and dates to ISO strings", () => {
    const dto = toAccessTokenDTO(base);
    expect(dto.lastUsedAt).toBeNull();
    expect(dto.expiresAt).toBeNull();
    expect(dto.revokedAt).toBeNull();
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("maps present dates to ISO strings", () => {
    const dto = toAccessTokenDTO({
      ...base,
      lastUsedAt: new Date("2026-02-02T00:00:00.000Z"),
      revokedAt: new Date("2026-03-03T00:00:00.000Z"),
    });
    expect(dto.lastUsedAt).toBe("2026-02-02T00:00:00.000Z");
    expect(dto.revokedAt).toBe("2026-03-03T00:00:00.000Z");
  });

  // The one regression that would actually matter: the raw token hash must never
  // be exposed in an API response.
  it("never leaks tokenHash", () => {
    const dto = toAccessTokenDTO({ ...base, tokenHash: "should-never-appear" } as never);
    expect(Object.keys(dto)).not.toContain("tokenHash");
    expect(JSON.stringify(dto)).not.toContain("should-never-appear");
  });
});

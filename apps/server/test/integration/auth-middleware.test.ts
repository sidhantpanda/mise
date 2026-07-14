import request from "supertest";
import { describe, expect, it } from "vitest";
import { bearer, getApp, setUpClient, signup } from "../helpers/client.js";
import { makeAccessToken, makeUserWithHousehold } from "../helpers/factories.js";
import { prisma } from "../../src/prisma.js";

setUpClient();

describe("requireAuth", () => {
  it("401s with no credentials", async () => {
    await request(getApp()).get("/api/recipes").expect(401);
  });

  it("a valid Bearer token authenticates and bumps lastUsedAt", async () => {
    const { token, householdId } = await bearer({ scopes: ["read"] });
    const before = await prisma.accessToken.findFirst({ where: { householdId } });
    expect(before!.lastUsedAt).toBeNull();

    await request(getApp()).get("/api/recipes").set("Authorization", `Bearer ${token}`).expect(200);

    const after = await prisma.accessToken.findUnique({ where: { id: before!.id } });
    expect(after!.lastUsedAt).not.toBeNull();
  });

  it("a revoked token gets 401 invalid_token", async () => {
    const { user, household } = await makeUserWithHousehold();
    const { raw } = await makeAccessToken({
      userId: user.id,
      householdId: household.id,
      revokedAt: new Date(),
    });
    const res = await request(getApp())
      .get("/api/recipes")
      .set("Authorization", `Bearer ${raw}`)
      .expect(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("an expired token gets 401", async () => {
    const { user, household } = await makeUserWithHousehold();
    const { raw } = await makeAccessToken({
      userId: user.id,
      householdId: household.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    await request(getApp()).get("/api/recipes").set("Authorization", `Bearer ${raw}`).expect(401);
  });

  it("403s (not 401) when the token owner has been removed from the household", async () => {
    const { user, household } = await makeUserWithHousehold();
    const { raw } = await makeAccessToken({ userId: user.id, householdId: household.id });
    await prisma.householdMember.delete({
      where: { householdId_userId: { householdId: household.id, userId: user.id } },
    });
    await request(getApp()).get("/api/recipes").set("Authorization", `Bearer ${raw}`).expect(403);
  });
});

describe("requireWriteAuth", () => {
  const writeRoutes: { method: "post" | "patch" | "delete"; path: string; body?: object }[] = [
    { method: "post", path: "/api/recipes", body: { name: "x" } },
    {
      method: "post",
      path: "/api/meals",
      body: { date: "2026-01-01", mealType: "Dinner", recipeId: "x" },
    },
    { method: "post", path: "/api/pantry", body: { name: "x" } },
    { method: "post", path: "/api/shopping", body: { name: "x" } },
  ];

  for (const route of writeRoutes) {
    it(`403s "Access token is read-only" for ${route.method.toUpperCase()} ${route.path} with a read-only token`, async () => {
      const { token } = await bearer({ scopes: ["read"] });
      const req = request(getApp())[route.method](route.path);
      const res = await req
        .set("Authorization", `Bearer ${token}`)
        .send(route.body ?? {})
        .expect(403);
      expect(res.body.error).toBe("Access token is read-only");
    });
  }
});

describe("requireSessionAuth", () => {
  const sessionOnlyRoutes = ["/api/auth/tokens", "/api/households", "/api/household"];

  for (const path of sessionOnlyRoutes) {
    it(`403s "Session authentication required" for a Bearer token on ${path}`, async () => {
      const { token } = await bearer({ scopes: ["read", "write"] });
      const res = await request(getApp()).get(path).set("Authorization", `Bearer ${token}`).expect(403);
      expect(res.body.error).toBe("Session authentication required");
    });
  }
});

describe("requireHousehold", () => {
  it('403s "No household" for a user with no household', async () => {
    const user = await signup();
    await user.agent.get("/api/recipes").expect(403);
  });
});

describe("WWW-Authenticate / resource_metadata", () => {
  it("a 401 from /mcp carries WWW-Authenticate with resource_metadata", async () => {
    const res = await request(getApp())
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      .expect(401);
    expect(res.headers["www-authenticate"]).toContain("resource_metadata=");
  });

  it("a 401 from /api/* does not carry WWW-Authenticate", async () => {
    const res = await request(getApp()).get("/api/recipes").expect(401);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });
});

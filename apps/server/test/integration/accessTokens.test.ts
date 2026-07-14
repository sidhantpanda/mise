import { describe, expect, it } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";

setUpClient();

describe("POST /api/auth/tokens", () => {
  it("creates a token and returns the raw value exactly once", async () => {
    const user = await withHousehold();
    const res = await user.agent
      .post("/api/auth/tokens")
      .send({ name: "CLI token", scopes: ["read", "write"] })
      .expect(201);
    expect(res.body.token).toMatch(/^mise_/);
    expect(res.body.prefix).toBe(res.body.token.slice(0, 16));
    expect(JSON.stringify(res.body)).not.toContain("tokenHash");
  });

  it("lists tokens without ever exposing tokenHash or the raw token", async () => {
    const user = await withHousehold();
    await user.agent.post("/api/auth/tokens").send({ name: "Token A" }).expect(201);
    const list = await user.agent.get("/api/auth/tokens").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].token).toBeUndefined();
    expect(JSON.stringify(list.body)).not.toContain("tokenHash");
  });
});

describe("DELETE /api/auth/tokens/:id", () => {
  it("revokes a token, and revoking it again is a no-op", async () => {
    const user = await withHousehold();
    const created = await user.agent.post("/api/auth/tokens").send({ name: "To revoke" }).expect(201);

    await user.agent.delete(`/api/auth/tokens/${created.body.id}`).expect(200);
    await user.agent.delete(`/api/auth/tokens/${created.body.id}`).expect(200);

    const list = await user.agent.get("/api/auth/tokens").expect(200);
    // Listing only returns non-revoked tokens.
    expect(list.body.find((t: { id: string }) => t.id === created.body.id)).toBeUndefined();
  });

  it("404s for another user's token", async () => {
    const owner = await withHousehold();
    const other = await withHousehold();
    const created = await owner.agent.post("/api/auth/tokens").send({ name: "Owner's" }).expect(201);
    await other.agent.delete(`/api/auth/tokens/${created.body.id}`).expect(404);
  });
});

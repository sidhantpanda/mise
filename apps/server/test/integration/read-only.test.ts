import { describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma.js";
import { setUpClient, withHousehold, type SignedUpUserWithHousehold } from "../helpers/client.js";
import { makeAccessToken } from "../helpers/factories.js";

setUpClient();

// A demo account whose credentials are published: signs up and builds a
// household normally, then gets flagged read-only. Everything it did before the
// flag stays put — the flag only governs what it can do next.
async function readOnlyActor(): Promise<SignedUpUserWithHousehold> {
  const user = await withHousehold();
  const me = user.me.user as { id: string };
  await prisma.user.update({ where: { id: me.id }, data: { isReadOnly: true } });
  return user;
}

describe("read-only accounts: household data", () => {
  it("still reads every collection", async () => {
    const user = await readOnlyActor();
    await user.agent.get("/api/recipes").expect(200);
    await user.agent.get("/api/meals").expect(200);
    await user.agent.get("/api/shopping").expect(200);
    await user.agent.get("/api/pantry").expect(200);
    await user.agent.get("/api/household").expect(200);
  });

  it("rejects recipe writes", async () => {
    const user = await readOnlyActor();
    const res = await user.agent.post("/api/recipes").send({ name: "Nope Soup" }).expect(403);
    expect(res.body.readOnly).toBe(true);
  });

  it("rejects meal-plan writes", async () => {
    const user = await readOnlyActor();
    await user.agent
      .post("/api/meals")
      .send({ date: "2026-01-01", mealType: "Dinner", servings: 2 })
      .expect(403);
  });

  it("rejects shopping-list writes", async () => {
    const user = await readOnlyActor();
    await user.agent.post("/api/shopping").send({ name: "Salt" }).expect(403);
    await user.agent.post("/api/shopping/clear-checked").expect(403);
  });

  it("rejects pantry writes", async () => {
    const user = await readOnlyActor();
    await user.agent.post("/api/pantry").send({ name: "Flour" }).expect(403);
  });

  it("cannot delete data it created before being flagged", async () => {
    const user = await withHousehold();
    const recipe = await user.agent.post("/api/recipes").send({ name: "Pre-flag Soup" }).expect(201);
    const me = user.me.user as { id: string };
    await prisma.user.update({ where: { id: me.id }, data: { isReadOnly: true } });

    await user.agent.delete(`/api/recipes/${recipe.body.identifier}`).expect(403);
    await user.agent.get(`/api/recipes/${recipe.body.identifier}`).expect(200);
  });
});

// The account-level surface is what makes publishing the credentials safe: a
// household-scoped role would leave all of these open.
describe("read-only accounts: account-level actions", () => {
  it("cannot create another household to write in", async () => {
    const user = await readOnlyActor();
    await user.agent.post("/api/households").send({ name: "Escape Hatch" }).expect(403);
  });

  it("cannot rename its household or invite anyone", async () => {
    const user = await readOnlyActor();
    await user.agent.patch("/api/household").send({ name: "Renamed" }).expect(403);
    await user.agent
      .post("/api/household/invitations")
      .send({ email: "spam@example.test" })
      .expect(403);
  });

  it("cannot mint an access token", async () => {
    const user = await readOnlyActor();
    await user.agent
      .post("/api/auth/tokens")
      .send({ name: "escape", scopes: ["write"] })
      .expect(403);
  });

  it("cannot switch its active household", async () => {
    const user = await readOnlyActor();
    const household = user.household as { id: string };
    await user.agent.post("/api/households/active").send({ householdId: household.id }).expect(403);
  });
});

describe("read-only accounts: bearer tokens", () => {
  it("demotes a write-scoped token issued before the account was flagged", async () => {
    const user = await withHousehold();
    const me = user.me.user as { id: string };
    const household = user.household as { id: string };
    const { raw } = await makeAccessToken({
      userId: me.id,
      householdId: household.id,
      scopes: ["read", "write"],
    });

    // The token works for writes right up until the flag lands.
    await user.agent
      .post("/api/recipes")
      .set("authorization", `Bearer ${raw}`)
      .send({ name: "Allowed Soup" })
      .expect(201);

    await prisma.user.update({ where: { id: me.id }, data: { isReadOnly: true } });

    await user.agent
      .post("/api/recipes")
      .set("authorization", `Bearer ${raw}`)
      .send({ name: "Blocked Soup" })
      .expect(403);
    await user.agent.get("/api/recipes").set("authorization", `Bearer ${raw}`).expect(200);
  });
});

describe("read-only accounts: /auth/me", () => {
  it("reports the flag so the client can disable its write controls", async () => {
    const user = await readOnlyActor();
    const res = await user.agent.get("/api/auth/me").expect(200);
    expect(res.body.user.isReadOnly).toBe(true);
  });

  it("reports false for an ordinary account", async () => {
    const user = await withHousehold();
    const res = await user.agent.get("/api/auth/me").expect(200);
    expect(res.body.user.isReadOnly).toBe(false);
  });
});

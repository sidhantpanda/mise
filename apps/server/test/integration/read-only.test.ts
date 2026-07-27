import { describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma.js";
import { setUpClient, withHousehold, type SignedUpUserWithHousehold } from "../helpers/client.js";
import { makeAccessToken } from "../helpers/factories.js";

setUpClient();

// A read-only account whose credentials are published: signs up and builds a
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

// The invite path is how a read-only account gets into a household at all: it
// cannot create one, so answering an invitation is deliberately exempt from the
// write guard.
describe("read-only accounts: joining a household by invitation", () => {
  it("can accept an invitation and lands in the household read-only", async () => {
    const owner = await withHousehold({ householdName: "Owner Kitchen" });
    const guest = await withHousehold();
    const guestMe = guest.me.user as { id: string; email: string };
    await prisma.user.update({ where: { id: guestMe.id }, data: { isReadOnly: true } });

    await owner.agent
      .post("/api/household/invitations")
      .send({ email: guestMe.email })
      .expect(201);
    const pending = await guest.agent.get("/api/auth/me").expect(200);
    const invitationId = pending.body.invitations[0].id as string;

    await guest.agent.post(`/api/invitations/${invitationId}/accept`).expect(200);

    const me = await guest.agent.get("/api/auth/me").expect(200);
    expect(me.body.household.name).toBe("Owner Kitchen");
    // In the household, and still unable to touch anything in it.
    await guest.agent.post("/api/recipes").send({ name: "Nope" }).expect(403);
  });

  it("can decline an invitation", async () => {
    const owner = await withHousehold();
    const guest = await withHousehold();
    const guestMe = guest.me.user as { id: string; email: string };
    await prisma.user.update({ where: { id: guestMe.id }, data: { isReadOnly: true } });

    await owner.agent
      .post("/api/household/invitations")
      .send({ email: guestMe.email })
      .expect(201);
    const pending = await guest.agent.get("/api/auth/me").expect(200);

    await guest.agent
      .post(`/api/invitations/${pending.body.invitations[0].id}/reject`)
      .expect(200);
  });
});

describe("Viewer role", () => {
  // Invites a fresh user as a Viewer and returns their agent, already in the
  // inviter's household.
  async function viewerOf(owner: SignedUpUserWithHousehold): Promise<SignedUpUserWithHousehold> {
    const guest = await withHousehold();
    const guestMe = guest.me.user as { email: string };
    await owner.agent
      .post("/api/household/invitations")
      .send({ email: guestMe.email, role: "Viewer" })
      .expect(201);
    const pending = await guest.agent.get("/api/auth/me").expect(200);
    await guest.agent.post(`/api/invitations/${pending.body.invitations[0].id}/accept`).expect(200);
    return guest;
  }

  it("defaults an invite with no role to Member", async () => {
    const owner = await withHousehold();
    const res = await owner.agent
      .post("/api/household/invitations")
      .send({ email: "plain@example.test" })
      .expect(201);
    expect(res.body.invitations.at(-1).role).toBe("Member");
  });

  it("records the requested role on the invitation", async () => {
    const owner = await withHousehold();
    const res = await owner.agent
      .post("/api/household/invitations")
      .send({ email: "viewer@example.test", role: "Viewer" })
      .expect(201);
    expect(res.body.invitations.at(-1).role).toBe("Viewer");
  });

  it("rejects Owner as an invitable role", async () => {
    const owner = await withHousehold();
    await owner.agent
      .post("/api/household/invitations")
      .send({ email: "usurper@example.test", role: "Owner" })
      .expect(400);
  });

  it("joins as a Viewer member", async () => {
    const owner = await withHousehold();
    const viewer = await viewerOf(owner);
    const household = await viewer.agent.get("/api/household").expect(200);
    const me = viewer.me.user as { id: string };
    const membership = household.body.members.find((m: { id: string }) => m.id === me.id);
    expect(membership.role).toBe("Viewer");
  });

  it("reads household data but cannot change it", async () => {
    const owner = await withHousehold();
    await owner.agent.post("/api/recipes").send({ name: "Owner Soup" }).expect(201);
    const viewer = await viewerOf(owner);

    const recipes = await viewer.agent.get("/api/recipes").expect(200);
    expect(recipes.body.some((r: { name: string }) => r.name === "Owner Soup")).toBe(true);

    const res = await viewer.agent.post("/api/recipes").send({ name: "Viewer Soup" }).expect(403);
    expect(res.body.readOnly).toBe(true);
    await viewer.agent.post("/api/meals").send({ date: "2026-01-01", mealType: "Dinner" }).expect(403);
    await viewer.agent.post("/api/shopping").send({ name: "Salt" }).expect(403);
    await viewer.agent.post("/api/pantry").send({ name: "Flour" }).expect(403);
  });

  it("cannot invite anyone or rename the household", async () => {
    const owner = await withHousehold();
    const viewer = await viewerOf(owner);
    await viewer.agent.patch("/api/household").send({ name: "Renamed" }).expect(403);
    await viewer.agent
      .post("/api/household/invitations")
      .send({ email: "friend@example.test" })
      .expect(403);
  });

  it("can switch away from the household it only views", async () => {
    const owner = await withHousehold();
    const viewer = await viewerOf(owner);
    const ownHousehold = viewer.household as { id: string };
    // Accepting moved them into the owner's kitchen; they must be able to get back.
    await viewer.agent
      .post("/api/households/active")
      .send({ householdId: ownHousehold.id })
      .expect(200);
    await viewer.agent.post("/api/recipes").send({ name: "Back Home Soup" }).expect(201);
  });

  // Unlike User.isReadOnly, a Viewer membership is scoped to one household —
  // the same account stays a full owner of its own.
  it("still writes freely in its own household", async () => {
    const owner = await withHousehold();
    const viewer = await viewerOf(owner);
    const own = await viewer.agent
      .post("/api/households")
      .send({ name: "Viewer's Own Kitchen", type: "Household" })
      .expect(201);
    expect(own.body.name).toBe("Viewer's Own Kitchen");
    await viewer.agent.post("/api/recipes").send({ name: "My Own Soup" }).expect(201);
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

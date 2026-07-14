import request from "supertest";
import { describe, expect, it } from "vitest";
import { getApp, setUpClient, signup, withHousehold } from "../helpers/client.js";
import { addMember, makeInvitation, makeUser, makeUserWithHousehold } from "../helpers/factories.js";
import { prisma } from "../../src/prisma.js";

setUpClient();

describe("POST /api/households", () => {
  it("makes the creator Owner and sets the household active", async () => {
    const user = await signup();
    const res = await user.agent
      .post("/api/households")
      .send({ name: "My Kitchen", type: "Household" })
      .expect(201);

    expect(res.body.name).toBe("My Kitchen");
    const owner = res.body.members.find((m: { role: string }) => m.role === "Owner");
    expect(owner).toBeDefined();

    const me = await user.agent.get("/api/auth/me").expect(200);
    expect(me.body.household.id).toBe(res.body.id);
  });
});

describe("POST /api/households/active", () => {
  it("403s for a household the user doesn't belong to", async () => {
    const user = await signup();
    const other = await makeUserWithHousehold();
    await user.agent
      .post("/api/households/active")
      .send({ householdId: other.household.id })
      .expect(403);
  });

  it("switches the active household for one the user belongs to", async () => {
    const a = await withHousehold({ householdName: "First" });
    const secondHousehold = await makeUserWithHousehold();
    await addMember(secondHousehold.household.id, (a.me as { user: { id: string } }).user.id);

    await a.agent
      .post("/api/households/active")
      .send({ householdId: secondHousehold.household.id })
      .expect(200);
    const me = await a.agent.get("/api/auth/me").expect(200);
    expect(me.body.household.id).toBe(secondHousehold.household.id);
  });
});

describe("getActiveHouseholdId fallback (lib/household.ts)", () => {
  it("falls back to the earliest membership when the saved activeHouseholdId is stale", async () => {
    // Set up directly via Prisma: a user whose activeHouseholdId points at a
    // household they've since been removed from, but who still has an older
    // membership elsewhere — the subtle branch getActiveHouseholdId guards.
    const user = await makeUser();
    const early = await makeUserWithHousehold();
    await addMember(early.household.id, user.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const removedFrom = await makeUserWithHousehold();
    await addMember(removedFrom.household.id, user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { activeHouseholdId: removedFrom.household.id },
    });
    await prisma.householdMember.delete({
      where: { householdId_userId: { householdId: removedFrom.household.id, userId: user.id } },
    });

    // Log in as this user through the API to exercise buildMe()/getActiveHouseholdId
    // exactly as a real request would.
    const agent = request.agent(getApp());
    await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: "password123" })
      .expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.household.id).toBe(early.household.id);
  });
});

describe("invitations", () => {
  it("inviting an existing email creates a Pending invitation visible in the invitee's /me", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();

    await inviter.agent
      .post("/api/household/invitations")
      .send({ email: invitee.email })
      .expect(201);

    const me = await invitee.agent.get("/api/auth/me").expect(200);
    expect(me.body.invitations).toHaveLength(1);
    expect(me.body.invitations[0].household.id).toBe(inviter.household.id);
  });

  it("accepting an invitation adds the membership", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    const me = await invitee.agent.get("/api/auth/me").expect(200);
    const invitationId = me.body.invitations[0].id;

    await invitee.agent.post(`/api/invitations/${invitationId}/accept`).expect(200);

    const after = await invitee.agent.get("/api/auth/me").expect(200);
    expect(after.body.household.id).toBe(inviter.household.id);
  });

  it("rejecting an invitation does not add the membership", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    const me = await invitee.agent.get("/api/auth/me").expect(200);
    const invitationId = me.body.invitations[0].id;

    await invitee.agent.post(`/api/invitations/${invitationId}/reject`).expect(200);

    const after = await invitee.agent.get("/api/auth/me").expect(200);
    expect(after.body.household).toBeNull();
  });

  it("rejects accepting an invitation addressed to a different email", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitation = await makeInvitation(inviter.household.id as string, "someone-else@example.test");
    const impostor = await signup();

    await impostor.agent.post(`/api/invitations/${invitation.id}/accept`).expect(403);
  });

  it("409s accepting an invitation that's already been accepted", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    const me = await invitee.agent.get("/api/auth/me").expect(200);
    const invitationId = me.body.invitations[0].id;

    await invitee.agent.post(`/api/invitations/${invitationId}/accept`).expect(200);
    await invitee.agent.post(`/api/invitations/${invitationId}/accept`).expect(409);
  });

  it("409s rejecting an invitation that's already been rejected", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    const me = await invitee.agent.get("/api/auth/me").expect(200);
    const invitationId = me.body.invitations[0].id;

    await invitee.agent.post(`/api/invitations/${invitationId}/reject`).expect(200);
    await invitee.agent.post(`/api/invitations/${invitationId}/reject`).expect(409);
  });

  it("409s re-inviting an email that's already a member, without touching their membership", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const member = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: member.email }).expect(201);
    const me = await member.agent.get("/api/auth/me").expect(200);
    await member.agent.post(`/api/invitations/${me.body.invitations[0].id}/accept`).expect(200);

    await inviter.agent
      .post("/api/household/invitations")
      .send({ email: member.email })
      .expect(409);

    const after = await inviter.agent.get("/api/household").expect(200);
    expect(after.body.members.some((m: { email: string }) => m.email === member.email)).toBe(true);
    expect(
      after.body.invitations.some((i: { email: string }) => i.email === member.email),
    ).toBe(false);
  });

  it("re-inviting a still-Pending invitee succeeds and refreshes sentAt", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    // getHouseholdDTO/getPendingInvitations truncate sentAt to a calendar date, so
    // read the raw row to see the refresh at full timestamp precision.
    const before = await prisma.invitation.findUniqueOrThrow({
      where: { householdId_email: { householdId: inviter.household.id as string, email: invitee.email } },
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const res = await inviter.agent
      .post("/api/household/invitations")
      .send({ email: invitee.email })
      .expect(201);

    const invitation = res.body.invitations.find((i: { email: string }) => i.email === invitee.email);
    expect(invitation?.status).toBe("Pending");
    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.sentAt.getTime()).toBeGreaterThan(before.sentAt.getTime());
  });

  it("re-inviting a Rejected invitee succeeds and resets it to Pending", async () => {
    const inviter = await withHousehold({ householdName: "Kitchen" });
    const invitee = await signup();
    await inviter.agent.post("/api/household/invitations").send({ email: invitee.email }).expect(201);
    const me = await invitee.agent.get("/api/auth/me").expect(200);
    await invitee.agent.post(`/api/invitations/${me.body.invitations[0].id}/reject`).expect(200);

    const res = await inviter.agent
      .post("/api/household/invitations")
      .send({ email: invitee.email })
      .expect(201);

    const invitation = res.body.invitations.find((i: { email: string }) => i.email === invitee.email);
    expect(invitation?.status).toBe("Pending");
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.acceptedAt).toBeNull();
  });
});

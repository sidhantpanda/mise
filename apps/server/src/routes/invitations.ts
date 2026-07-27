import { Router } from "express";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { routeParam } from "../lib/request.js";
import { requireWriteAuth } from "../middleware/auth.js";

// Respond to invitations addressed to the authenticated user. Mounted behind
// requireAuth only (a household-less user needs to accept from onboarding).
export const invitationsRouter = Router();

// Loads the invitation and verifies it's a pending invite addressed to the
// caller's own email.
async function loadOwnPendingInvitation(invitationId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new AppError(401, "Not authenticated");

  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError(403, "This invitation isn't addressed to you");
  }
  if (invitation.status !== "Pending")
    throw new AppError(409, "This invitation is no longer pending");
  return invitation;
}

invitationsRouter.post("/:id/accept", requireWriteAuth, async (req, res) => {
  const userId = req.user!.id;
  const invitation = await loadOwnPendingInvitation(
    routeParam(req.params.id, "Invitation id"),
    userId,
  );

  await prisma.$transaction(async (tx) => {
    // Idempotent: tolerate already being a member.
    await tx.householdMember.upsert({
      where: { householdId_userId: { householdId: invitation.householdId, userId } },
      create: { householdId: invitation.householdId, userId, role: invitation.role },
      update: {},
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "Accepted", acceptedAt: new Date() },
    });
    // Drop the user into the household they just joined.
    await tx.user.update({
      where: { id: userId },
      data: { activeHouseholdId: invitation.householdId },
    });
  });

  res.json({ ok: true });
});

invitationsRouter.post("/:id/reject", requireWriteAuth, async (req, res) => {
  const invitation = await loadOwnPendingInvitation(
    routeParam(req.params.id, "Invitation id"),
    req.user!.id,
  );
  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "Rejected" } });
  res.json({ ok: true });
});

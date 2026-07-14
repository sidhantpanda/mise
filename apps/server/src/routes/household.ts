import { Router } from "express";
import { householdInviteSchema, householdUpdateSchema } from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { getHouseholdDTO } from "../lib/household.js";

export const householdRouter = Router();

householdRouter.get("/", async (req, res) => {
  res.json(await getHouseholdDTO(req.user!.householdId));
});

householdRouter.patch("/", async (req, res) => {
  const input = householdUpdateSchema.parse(req.body);
  await prisma.household.update({ where: { id: req.user!.householdId }, data: input });
  res.json(await getHouseholdDTO(req.user!.householdId));
});

householdRouter.post("/invitations", async (req, res) => {
  const { email } = householdInviteSchema.parse(req.body);
  const householdId = req.user!.householdId;

  // email is already lowercased by householdInviteSchema; emails are stored
  // lowercased too, so this is a direct lookup.
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const membership = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: existingUser.id } },
    });
    if (membership) throw new AppError(409, "That person is already a member of this household");
  }

  await prisma.invitation.upsert({
    where: { householdId_email: { householdId, email } },
    create: { householdId, email },
    update: { sentAt: new Date(), status: "Pending", acceptedAt: null },
  });
  res.status(201).json(await getHouseholdDTO(householdId));
});

householdRouter.delete("/invitations/:id", async (req, res) => {
  const { count } = await prisma.invitation.deleteMany({
    where: { id: req.params.id, householdId: req.user!.householdId },
  });
  if (count === 0) throw new AppError(404, "Invitation not found");
  res.json(await getHouseholdDTO(req.user!.householdId));
});

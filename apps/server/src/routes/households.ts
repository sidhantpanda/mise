import { Router } from "express";
import { activeHouseholdSchema, householdCreateSchema } from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { getHouseholdDTO } from "../lib/household.js";

// Cross-household operations available to any authenticated user (including one
// who has no household yet). Mounted behind requireAuth only.
export const householdsRouter = Router();

// Create a new household/restaurant and make it the user's active one. Used by
// the onboarding flow and the sidebar "Create household" action.
householdsRouter.post("/", async (req, res) => {
  const userId = req.user!.id;
  const { name, type } = householdCreateSchema.parse(req.body);

  const household = await prisma.$transaction(async (tx) => {
    const created = await tx.household.create({ data: { name, type, createdById: userId } });
    await tx.householdMember.create({
      data: { householdId: created.id, userId, role: "Owner" },
    });
    await tx.user.update({ where: { id: userId }, data: { activeHouseholdId: created.id } });
    return created;
  });

  res.status(201).json(await getHouseholdDTO(household.id));
});

// Switch the active household. Only allowed for households the user belongs to.
householdsRouter.post("/active", async (req, res) => {
  const userId = req.user!.id;
  const { householdId } = activeHouseholdSchema.parse(req.body);

  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { householdId: true },
  });
  if (!membership) throw new AppError(403, "You are not a member of that household");

  await prisma.user.update({ where: { id: userId }, data: { activeHouseholdId: householdId } });
  res.json({ ok: true });
});

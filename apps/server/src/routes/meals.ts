import { Router } from "express";
import { mealCreateSchema, mealUpdateSchema } from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toMealDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const mealsRouter = Router();

// recipeId is a global FK with no household scoping at the DB level, so every
// write path has to check ownership itself — mirrors the MCP write tools
// (add_meal_to_plan / update_planned_meal in mcp/server.ts), which already do this.
async function assertRecipeInHousehold(recipeId: string, householdId: string): Promise<void> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { id: true },
  });
  if (!recipe) throw new AppError(404, "Recipe not found");
}

// assigneeId has no FK to User at all, so this is the only thing stopping a
// made-up or foreign id from persisting silently.
async function assertHouseholdMember(userId: string, householdId: string): Promise<void> {
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { householdId: true },
  });
  if (!membership) throw new AppError(400, "Assignee is not a member of this household");
}

mealsRouter.get("/", async (req, res) => {
  const meals = await prisma.plannedMeal.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { date: "asc" },
  });
  res.json(meals.map(toMealDTO));
});

mealsRouter.post("/", requireWriteAuth, async (req, res) => {
  const input = mealCreateSchema.parse(req.body);
  const householdId = req.user!.householdId;
  await assertRecipeInHousehold(input.recipeId, householdId);
  if (input.assignee) await assertHouseholdMember(input.assignee, householdId);
  const meal = await prisma.plannedMeal.create({
    data: {
      householdId,
      date: input.date,
      mealType: input.mealType,
      recipeId: input.recipeId,
      servings: input.servings,
      // `|| null`, not `?? null`: an empty-string assignee means "unassigned" (the
      // membership check above skips it), so store null rather than persisting "".
      assigneeId: input.assignee || null,
    },
  });
  res.status(201).json(toMealDTO(meal));
});

mealsRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Meal id");
  const input = mealUpdateSchema.parse(req.body);
  const householdId = req.user!.householdId;
  const existing = await prisma.plannedMeal.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Meal not found");
  if (input.recipeId !== undefined) await assertRecipeInHousehold(input.recipeId, householdId);
  if (input.assignee) await assertHouseholdMember(input.assignee, householdId);
  const meal = await prisma.plannedMeal.update({
    where: { id },
    data: {
      date: input.date,
      mealType: input.mealType,
      recipeId: input.recipeId,
      servings: input.servings,
      ...(input.assignee !== undefined ? { assigneeId: input.assignee || null } : {}),
    },
  });
  res.json(toMealDTO(meal));
});

mealsRouter.delete("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Meal id");
  const { count } = await prisma.plannedMeal.deleteMany({
    where: { id, householdId: req.user!.householdId },
  });
  if (count === 0) throw new AppError(404, "Meal not found");
  res.json({ ok: true });
});

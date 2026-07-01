import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toMealDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const mealsRouter = Router();

const mealType = z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]);

const createSchema = z.object({
  date: z.string().min(1),
  mealType,
  recipeId: z.string().min(1),
  servings: z.number().int().positive().default(1),
  assignee: z.string().optional(),
});

const updateSchema = z
  .object({
    date: z.string().min(1),
    mealType,
    recipeId: z.string().min(1),
    servings: z.number().int().positive(),
    assignee: z.string().nullable(),
  })
  .partial();

mealsRouter.get("/", async (req, res) => {
  const meals = await prisma.plannedMeal.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { date: "asc" },
  });
  res.json(meals.map(toMealDTO));
});

mealsRouter.post("/", requireWriteAuth, async (req, res) => {
  const input = createSchema.parse(req.body);
  const meal = await prisma.plannedMeal.create({
    data: {
      householdId: req.user!.householdId,
      date: input.date,
      mealType: input.mealType,
      recipeId: input.recipeId,
      servings: input.servings,
      assigneeId: input.assignee ?? null,
    },
  });
  res.status(201).json(toMealDTO(meal));
});

mealsRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Meal id");
  const input = updateSchema.parse(req.body);
  const existing = await prisma.plannedMeal.findFirst({
    where: { id, householdId: req.user!.householdId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Meal not found");
  const meal = await prisma.plannedMeal.update({
    where: { id },
    data: {
      date: input.date,
      mealType: input.mealType,
      recipeId: input.recipeId,
      servings: input.servings,
      ...(input.assignee !== undefined ? { assigneeId: input.assignee } : {}),
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

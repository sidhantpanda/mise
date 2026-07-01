import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toShoppingDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const shoppingRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.string().default(""),
  category: z.string().default(""),
  checked: z.boolean().default(false),
  fromRecipeId: z.string().optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1),
    quantity: z.string(),
    category: z.string(),
    checked: z.boolean(),
    fromRecipeId: z.string().nullable(),
  })
  .partial();

const checkedUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  checked: z.boolean(),
});

shoppingRouter.get("/", async (req, res) => {
  const items = await prisma.shoppingItem.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map(toShoppingDTO));
});

shoppingRouter.post("/", requireWriteAuth, async (req, res) => {
  const input = createSchema.parse(req.body);
  const item = await prisma.shoppingItem.create({
    data: {
      householdId: req.user!.householdId,
      name: input.name,
      quantity: input.quantity,
      category: input.category,
      checked: input.checked,
      fromRecipeId: input.fromRecipeId ?? null,
    },
  });
  res.status(201).json(toShoppingDTO(item));
});

// Clear all checked items. Defined before "/:id" so the literal path wins.
shoppingRouter.post("/clear-checked", requireWriteAuth, async (req, res) => {
  await prisma.shoppingItem.deleteMany({
    where: { householdId: req.user!.householdId, checked: true },
  });
  const items = await prisma.shoppingItem.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map(toShoppingDTO));
});

// Add a recipe's ingredients to the list, skipping names already present
// (case-insensitive) — mirrors the old shoppingActions.addFromRecipe.
shoppingRouter.post("/from-recipe/:recipeId", requireWriteAuth, async (req, res) => {
  const householdId = req.user!.householdId;
  const recipeId = routeParam(req.params.recipeId, "Recipe id");
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { id: true, recipeIngredient: true },
  });
  if (!recipe) throw new AppError(404, "Recipe not found");

  const existing = await prisma.shoppingItem.findMany({
    where: { householdId },
    select: { name: true },
  });
  const present = new Set(existing.map((s) => s.name.toLowerCase()));

  const additions = recipe.recipeIngredient.filter((ing) => !present.has(ing.toLowerCase()));
  if (additions.length > 0) {
    await prisma.shoppingItem.createMany({
      data: additions.map((name) => ({
        householdId,
        name,
        quantity: "",
        category: "From recipe",
        fromRecipeId: recipe.id,
      })),
    });
  }

  const items = await prisma.shoppingItem.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ added: additions.length, items: items.map(toShoppingDTO) });
});

shoppingRouter.patch("/", requireWriteAuth, async (req, res) => {
  const input = checkedUpdateSchema.parse(req.body);
  const { count } = await prisma.shoppingItem.updateMany({
    where: { id: { in: input.ids }, householdId: req.user!.householdId },
    data: { checked: input.checked },
  });
  if (count === 0) throw new AppError(404, "Shopping item not found");

  const items = await prisma.shoppingItem.findMany({
    where: { id: { in: input.ids }, householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map(toShoppingDTO));
});

shoppingRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Shopping item id");
  const input = updateSchema.parse(req.body);
  const { count } = await prisma.shoppingItem.updateMany({
    where: { id, householdId: req.user!.householdId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.checked !== undefined ? { checked: input.checked } : {}),
      ...(input.fromRecipeId !== undefined ? { fromRecipeId: input.fromRecipeId } : {}),
    },
  });
  if (count === 0) throw new AppError(404, "Shopping item not found");
  const item = await prisma.shoppingItem.findUnique({ where: { id } });
  res.json(toShoppingDTO(item!));
});

shoppingRouter.delete("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Shopping item id");
  const { count } = await prisma.shoppingItem.deleteMany({
    where: { id, householdId: req.user!.householdId },
  });
  if (count === 0) throw new AppError(404, "Shopping item not found");
  res.json({ ok: true });
});

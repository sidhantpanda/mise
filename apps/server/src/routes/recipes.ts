import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toRecipeDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";
import { normalizeRecipeInstructions } from "../lib/recipeInstructions.js";
import { findRecipeJsonLd, isRecord } from "../lib/schemaJson.js";

export const recipesRouter = Router();

const nutritionSchema = z
  .object({
    "@type": z.literal("NutritionInformation").optional(),
    calories: z.string().optional(),
    proteinContent: z.string().optional(),
    carbohydrateContent: z.string().optional(),
    fatContent: z.string().optional(),
  })
  .nullish();

const optionalString = z.unknown().transform((value) => (typeof value === "string" ? value : undefined));

const stringList = z.unknown().transform((value) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
});

const authorSchema = z.unknown().transform((value) => {
  if (!isRecord(value) || typeof value.name !== "string") return undefined;
  return { name: value.name };
});

// Accepts the Schema.org Recipe shape the web app produces. All fields optional
// for PATCH; create applies sensible defaults via Prisma.
const recipeInput = z.object({
  name: z.string().trim().min(1).optional(),
  description: optionalString.optional(),
  image: stringList.optional(),
  author: authorSchema.optional(),
  prepTime: optionalString.optional(),
  cookTime: optionalString.optional(),
  performTime: optionalString.optional(),
  totalTime: optionalString.optional(),
  cookingMethod: optionalString.optional(),
  recipeYield: optionalString.optional(),
  yield: z.unknown().optional(),
  recipeCategory: optionalString.optional(),
  recipeCuisine: optionalString.optional(),
  keywords: stringList.optional(),
  suitableForDiet: stringList.optional(),
  recipeIngredient: stringList.optional(),
  recipeInstructions: z.unknown().optional(),
  estimatedCost: z.unknown().optional(),
  supply: z.unknown().optional(),
  tool: z.unknown().optional(),
  nutrition: nutritionSchema,
  schemaJson: z.unknown().optional(),
  aggregateRating: z
    .object({ ratingValue: z.coerce.number(), ratingCount: z.coerce.number().int() })
    .nullish(),
});

type RecipeInput = z.infer<typeof recipeInput>;

function recipeBody(body: unknown) {
  const explicitSchemaJson = isRecord(body) && body.schemaJson ? body.schemaJson : undefined;
  const foundRecipe = findRecipeJsonLd(body);
  const schemaJson = explicitSchemaJson ?? foundRecipe;
  const source = explicitSchemaJson ? body : foundRecipe ?? body;
  return { ...(isRecord(source) ? source : {}), schemaJson };
}

function definedEntries(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function schemaJsonFor(input: RecipeInput) {
  if (input.schemaJson === undefined) return undefined;
  const base = isRecord(input.schemaJson) ? input.schemaJson : {};
  return definedEntries({
    ...base,
    "@context": base["@context"] ?? "https://schema.org",
    "@type": base["@type"] ?? "Recipe",
    name: input.name,
    description: input.description,
    image: input.image,
    author: input.author,
    prepTime: input.prepTime,
    cookTime: input.cookTime,
    performTime: input.performTime,
    totalTime: input.totalTime,
    cookingMethod: input.cookingMethod,
    recipeYield: input.recipeYield,
    yield: input.yield,
    recipeCategory: input.recipeCategory,
    recipeCuisine: input.recipeCuisine,
    keywords: input.keywords,
    suitableForDiet: input.suitableForDiet,
    recipeIngredient: input.recipeIngredient,
    recipeInstructions:
      input.recipeInstructions === undefined
        ? undefined
        : normalizeRecipeInstructions(input.recipeInstructions),
    estimatedCost: input.estimatedCost,
    supply: input.supply,
    tool: input.tool,
    nutrition: input.nutrition ?? undefined,
    aggregateRating: input.aggregateRating ?? undefined,
  });
}

function toColumns(input: RecipeInput): Prisma.RecipeUncheckedUpdateInput {
  const data: Prisma.RecipeUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.image !== undefined) data.image = input.image;
  if (input.author?.name !== undefined) data.authorName = input.author.name;
  if (input.prepTime !== undefined) data.prepTime = input.prepTime;
  if (input.cookTime !== undefined) data.cookTime = input.cookTime;
  if (input.performTime !== undefined) data.performTime = input.performTime;
  if (input.totalTime !== undefined) data.totalTime = input.totalTime;
  if (input.cookingMethod !== undefined) data.cookingMethod = input.cookingMethod;
  if (input.recipeYield !== undefined) data.recipeYield = input.recipeYield;
  if (input.yield !== undefined) data.howToYield = input.yield as Prisma.InputJsonValue;
  if (input.recipeCategory !== undefined) data.recipeCategory = input.recipeCategory;
  if (input.recipeCuisine !== undefined) data.recipeCuisine = input.recipeCuisine;
  if (input.keywords !== undefined) data.keywords = input.keywords;
  if (input.suitableForDiet !== undefined) data.suitableForDiet = input.suitableForDiet;
  if (input.recipeIngredient !== undefined) data.recipeIngredient = input.recipeIngredient;
  if (input.recipeInstructions !== undefined)
    data.recipeInstructions = normalizeRecipeInstructions(input.recipeInstructions) as Prisma.InputJsonValue;
  if (input.estimatedCost !== undefined) data.estimatedCost = input.estimatedCost as Prisma.InputJsonValue;
  if (input.supply !== undefined) data.supply = input.supply as Prisma.InputJsonValue;
  if (input.tool !== undefined) data.tool = input.tool as Prisma.InputJsonValue;
  if (input.nutrition !== undefined)
    data.nutrition = (input.nutrition ?? undefined) as Prisma.InputJsonValue | undefined;
  const schemaJson = schemaJsonFor(input);
  if (schemaJson !== undefined) data.schemaJson = schemaJson as Prisma.InputJsonValue;
  if (input.aggregateRating !== undefined) {
    data.ratingValue = input.aggregateRating?.ratingValue ?? null;
    data.ratingCount = input.aggregateRating?.ratingCount ?? null;
  }
  return data;
}

// Resolve the author's current display name from their user id for every recipe.
const withAuthor = { createdBy: { select: { displayName: true } } } satisfies Prisma.RecipeInclude;

recipesRouter.get("/", async (req, res) => {
  const recipes = await prisma.recipe.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
    include: withAuthor,
  });
  res.json(recipes.map(toRecipeDTO));
});

recipesRouter.get("/:id", async (req, res) => {
  const id = routeParam(req.params.id, "Recipe id");
  const recipe = await prisma.recipe.findFirst({
    where: { id, householdId: req.user!.householdId },
    include: withAuthor,
  });
  if (!recipe) throw new AppError(404, "Recipe not found");
  res.json(toRecipeDTO(recipe));
});

recipesRouter.post("/", requireWriteAuth, async (req, res) => {
  const input = recipeInput.parse(recipeBody(req.body));
  if (!input.name) throw new AppError(400, "Recipe name is required");
  const recipe = await prisma.recipe.create({
    data: {
      ...(toColumns(input) as Prisma.RecipeUncheckedCreateInput),
      householdId: req.user!.householdId,
      createdById: req.user!.id,
      datePublished: new Date().toISOString().slice(0, 10),
      name: input.name,
    },
    include: withAuthor,
  });
  res.status(201).json(toRecipeDTO(recipe));
});

recipesRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Recipe id");
  const input = recipeInput.parse(recipeBody(req.body));
  const existing = await prisma.recipe.findFirst({
    where: { id, householdId: req.user!.householdId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Recipe not found");
  const recipe = await prisma.recipe.update({
    where: { id },
    data: toColumns(input),
    include: withAuthor,
  });
  res.json(toRecipeDTO(recipe));
});

recipesRouter.delete("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Recipe id");
  const existing = await prisma.recipe.findFirst({
    where: { id, householdId: req.user!.householdId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "Recipe not found");
  // Planned meals reference the recipe with onDelete: SetNull; remove them too to
  // match the old store behavior (recipeActions.remove also dropped its meals).
  await prisma.$transaction([
    prisma.plannedMeal.deleteMany({
      where: { recipeId: id, householdId: req.user!.householdId },
    }),
    prisma.recipe.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
});

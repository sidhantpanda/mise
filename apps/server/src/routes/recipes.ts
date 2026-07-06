import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { strFromU8, unzipSync } from "fflate";
import multer from "multer";
import {
  findRecipeJsonLd,
  findRecipeJsonLds,
  isRecord,
  normalizeRecipeInstructions,
  recipeInputSchema,
  type ParsedRecipeInput,
} from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toRecipeDTO } from "../lib/mappers.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const recipesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type RecipeInput = ParsedRecipeInput;

type UploadDocument = {
  source: string;
  value: unknown;
};

function recipeBody(body: unknown) {
  const explicitSchemaJson = isRecord(body) && body.schemaJson ? body.schemaJson : undefined;
  const foundRecipe = findRecipeJsonLd(body);
  const schemaJson = explicitSchemaJson ?? foundRecipe;
  const source = explicitSchemaJson ? body : (foundRecipe ?? body);
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
    data.recipeInstructions = normalizeRecipeInstructions(
      input.recipeInstructions,
    ) as Prisma.InputJsonValue;
  if (input.estimatedCost !== undefined)
    data.estimatedCost = input.estimatedCost as Prisma.InputJsonValue;
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

function parseJsonDocument(source: string, text: string): UploadDocument {
  try {
    return { source, value: JSON.parse(text) };
  } catch {
    throw new AppError(400, `${source} is not valid JSON`);
  }
}

function uploadDocuments(file: Express.Multer.File): UploadDocument[] {
  const filename = file.originalname.toLowerCase();
  if (filename.endsWith(".zip")) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(file.buffer));
    } catch {
      throw new AppError(400, "ZIP file could not be read");
    }

    return Object.entries(entries)
      .filter(([name]) => {
        const lower = name.toLowerCase();
        return lower.endsWith(".json") || lower.endsWith(".jsonld");
      })
      .map(([name, data]) => parseJsonDocument(name, strFromU8(data)));
  }

  if (!filename.endsWith(".json") && !filename.endsWith(".jsonld")) {
    throw new AppError(400, "Upload a JSON-LD file or a ZIP of JSON-LD files");
  }

  return [parseJsonDocument(file.originalname, file.buffer.toString("utf8"))];
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
  const input = recipeInputSchema.parse(recipeBody(req.body));
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

recipesRouter.post("/upload", requireWriteAuth, upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "Recipe upload file is required");

  const documents = uploadDocuments(req.file);
  const candidates = documents.flatMap((document) =>
    findRecipeJsonLds(document.value).map((recipe) => ({
      source: document.source,
      recipe,
    })),
  );

  if (candidates.length === 0) {
    throw new AppError(400, "No Schema.org Recipe JSON-LD was found in the upload");
  }

  const created: ReturnType<typeof toRecipeDTO>[] = [];
  const errors: { source: string; name?: string; error: string }[] = [];

  for (const candidate of candidates) {
    try {
      const input = recipeInputSchema.parse(recipeBody(candidate.recipe));
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
      created.push(toRecipeDTO(recipe));
    } catch (err) {
      const error =
        err instanceof AppError
          ? err.message
          : err instanceof z.ZodError
            ? "Validation failed"
            : "Recipe could not be imported";
      errors.push({
        source: candidate.source,
        name: typeof candidate.recipe.name === "string" ? candidate.recipe.name : undefined,
        error,
      });
    }
  }

  if (created.length === 0) {
    throw new AppError(400, errors[0]?.error ?? "No recipes could be imported");
  }

  res.status(201).json({ created, errors });
});

recipesRouter.patch("/:id", requireWriteAuth, async (req, res) => {
  const id = routeParam(req.params.id, "Recipe id");
  const input = recipeInputSchema.parse(recipeBody(req.body));
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

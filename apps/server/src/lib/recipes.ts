import type { Prisma } from "@prisma/client";
import {
  isRecord,
  normalizeRecipeInstructions,
  recipeInputSchema,
  type ParsedRecipeInput,
} from "common";
import { prisma } from "../prisma.js";
import { AppError } from "./AppError.js";
import { toRecipeDTO } from "./mappers.js";
import { indexRecipe } from "./recipeSearch.js";
import { findRecipeJsonLd } from "common";

type RecipeInput = ParsedRecipeInput;

// Resolve the author's current display name from their user id for every recipe.
export const withAuthor = {
  createdBy: { select: { displayName: true } },
} satisfies Prisma.RecipeInclude;

// Normalize an arbitrary request body into the shape recipeInputSchema expects.
// Accepts an explicit `schemaJson` field, a bare Schema.org Recipe node, or a
// document that embeds one (e.g. an `@graph`), and always carries the resolved
// JSON-LD forward as `schemaJson`.
export function recipeBody(body: unknown) {
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

export function toColumns(input: RecipeInput): Prisma.RecipeUncheckedUpdateInput {
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

// Create a recipe from an arbitrary body (JSON-LD or the flat recipe shape) for a
// given household + author. Shared by the REST route and the MCP `create_recipe`
// tool so both accept exactly the same inputs. Throws AppError(400) when the body
// has no usable recipe name.
export async function createRecipe(params: {
  body: unknown;
  householdId: string;
  createdById: string;
}) {
  const input = recipeInputSchema.parse(recipeBody(params.body));
  if (!input.name) throw new AppError(400, "Recipe name is required");
  const recipe = await prisma.recipe.create({
    data: {
      ...(toColumns(input) as Prisma.RecipeUncheckedCreateInput),
      householdId: params.householdId,
      createdById: params.createdById,
      datePublished: new Date().toISOString().slice(0, 10),
      name: input.name,
    },
    include: withAuthor,
  });
  await indexRecipe(recipe);
  return toRecipeDTO(recipe);
}

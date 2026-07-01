import type {
  PantryItem as PrismaPantryItem,
  PlannedMeal as PrismaPlannedMeal,
  Recipe as PrismaRecipe,
  ShoppingItem as PrismaShoppingItem,
} from "@prisma/client";
import { normalizeRecipeInstructions } from "./recipeInstructions.js";
import { asString, compactObject, isRecord } from "./schemaJson.js";

// These output shapes mirror apps/web/src/lib/mock-data.ts exactly so the
// frontend can consume API responses without remapping.

const DEFAULT_RECIPE_IMAGE =
  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=1200&q=80";

type Nutrition = {
  "@type": "NutritionInformation";
  calories?: string;
  proteinContent?: string;
  carbohydrateContent?: string;
  fatContent?: string;
};

// `createdBy` resolves the author's identity from their user id, so the name is
// always current and the client can detect "your" recipes by id (not by name).
export function toRecipeDTO(r: PrismaRecipe & { createdBy?: { displayName: string } | null }) {
  const schemaJson = isRecord(r.schemaJson) ? r.schemaJson : {};
  const optionalFields = compactObject({
    performTime: r.performTime || asString(schemaJson.performTime),
    cookingMethod: r.cookingMethod || asString(schemaJson.cookingMethod),
    yield: r.howToYield ?? schemaJson.yield,
    estimatedCost: r.estimatedCost ?? schemaJson.estimatedCost,
    supply: r.supply ?? schemaJson.supply,
    tool: r.tool ?? schemaJson.tool,
    nutrition: (r.nutrition as Nutrition | null) ?? schemaJson.nutrition,
    aggregateRating:
      r.ratingValue != null && r.ratingCount != null
        ? {
            "@type": "AggregateRating" as const,
            ratingValue: r.ratingValue,
            ratingCount: r.ratingCount,
          }
        : schemaJson.aggregateRating,
  });

  return {
    ...schemaJson,
    ...optionalFields,
    "@context": "https://schema.org" as const,
    "@type": "Recipe" as const,
    identifier: r.id,
    name: r.name || asString(schemaJson.name) || "",
    description: r.description || asString(schemaJson.description) || "",
    image: r.image.length ? r.image : [DEFAULT_RECIPE_IMAGE],
    author: {
      "@type": "Person" as const,
      identifier: r.createdById ?? undefined,
      name: r.createdBy?.displayName ?? r.authorName,
    },
    datePublished: r.datePublished || asString(schemaJson.datePublished) || "",
    prepTime: r.prepTime || asString(schemaJson.prepTime) || "",
    cookTime: r.cookTime || asString(schemaJson.cookTime) || "",
    totalTime: r.totalTime || asString(schemaJson.totalTime) || "",
    recipeYield: r.recipeYield || asString(schemaJson.recipeYield) || "",
    recipeCategory: r.recipeCategory || asString(schemaJson.recipeCategory) || "",
    recipeCuisine: r.recipeCuisine || asString(schemaJson.recipeCuisine) || "",
    keywords: r.keywords,
    suitableForDiet: r.suitableForDiet,
    recipeIngredient: r.recipeIngredient,
    recipeInstructions: normalizeRecipeInstructions(r.recipeInstructions),
  };
}

export function toPantryDTO(p: PrismaPantryItem) {
  return {
    "@type": "Product" as const,
    identifier: p.id,
    name: p.name,
    category: p.category,
    quantity: {
      "@type": "QuantitativeValue" as const,
      value: p.quantityValue,
      unitText: p.quantityUnit,
    },
    expires: p.expires ?? undefined,
    location: p.location,
  };
}

export function toMealDTO(m: PrismaPlannedMeal) {
  return {
    identifier: m.id,
    date: m.date,
    mealType: m.mealType,
    recipeId: m.recipeId ?? "",
    servings: m.servings,
    assignee: m.assigneeId ?? undefined,
  };
}

export function toShoppingDTO(s: PrismaShoppingItem) {
  return {
    id: s.id,
    name: s.name,
    quantity: s.quantity,
    category: s.category,
    checked: s.checked,
    fromRecipeId: s.fromRecipeId ?? undefined,
  };
}

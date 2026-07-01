/**
 * Domain types using Schema.org vocabulary (https://schema.org/Recipe).
 * These mirror the JSON the API returns (see apps/server/src/lib/mappers.ts), so
 * components and React Query hooks share one set of types. The seed data that
 * used to live here now lives in apps/server/prisma/seed.ts.
 */

export type ISODuration = string; // e.g. "PT30M" = 30 minutes

export interface HowToStep {
  "@type": "HowToStep";
  name?: string;
  text: string;
}

export interface HowToSection {
  "@type": "HowToSection";
  name?: string;
  itemListElement: HowToStep[];
}

export type RecipeInstruction = HowToStep | HowToSection;

/** Schema.org Recipe — https://schema.org/Recipe */
export interface Recipe {
  [key: string]: unknown;
  "@context": "https://schema.org";
  "@type": "Recipe";
  identifier: string;
  name: string;
  description: string;
  image: string[];
  author: { "@type": "Person" | "Organization"; name: string; identifier?: string };
  datePublished: string; // ISO 8601
  prepTime: ISODuration;
  cookTime: ISODuration;
  performTime?: ISODuration;
  totalTime: ISODuration;
  cookingMethod?: string;
  recipeYield: string;
  yield?: unknown;
  recipeCategory: string;
  recipeCuisine: string;
  keywords: string[];
  suitableForDiet?: string[]; // RestrictedDiet enum values
  recipeIngredient: string[]; // free-text per Schema.org spec
  recipeInstructions: RecipeInstruction[];
  estimatedCost?: unknown;
  supply?: unknown;
  tool?: unknown;
  nutrition?: {
    "@type": "NutritionInformation";
    calories?: string;
    proteinContent?: string;
    carbohydrateContent?: string;
    fatContent?: string;
  };
  aggregateRating?: { "@type": "AggregateRating"; ratingValue: number; ratingCount: number };
}

/** Parsed ingredient line — derived from recipeIngredient strings for shopping lists/pantry. */
export interface ParsedIngredient {
  id: string;
  recipeId: string;
  raw: string;
  quantity: number | null;
  unit: string | null;
  item: string;
}

/** Pantry item — Schema.org "Product" subset with QuantitativeValue. */
export interface PantryItem {
  "@type": "Product";
  identifier: string;
  name: string;
  category: string;
  quantity: { "@type": "QuantitativeValue"; value: number; unitText: string };
  expires?: string; // ISO date
  location: "Pantry" | "Fridge" | "Freezer";
}

/** Meal plan entry — Schema.org "PlanAction" style. */
export interface PlannedMeal {
  identifier: string;
  date: string; // YYYY-MM-DD
  mealType: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  recipeId: string;
  servings: number;
  assignee?: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  checked: boolean;
  fromRecipeId?: string;
}

export type HouseholdType = "Household" | "Restaurant";

export interface HouseholdSummary {
  id: string;
  name: string;
  type: HouseholdType;
}

export interface Household {
  id: string;
  name: string;
  type: HouseholdType;
  members: {
    id: string;
    name: string;
    email: string;
    role: "Owner" | "Admin" | "Member";
    avatarColor: string;
  }[];
  invitations: { id: string; email: string; status: "Pending" | "Rejected"; sentAt: string }[];
}

/** A pending invitation addressed to the current user (shown in onboarding + switcher). */
export interface PendingInvitation {
  id: string;
  household: HouseholdSummary;
  inviterName: string;
  role: "Owner" | "Admin" | "Member";
  sentAt: string;
}

export const isoDurationToMinutes = (iso: ISODuration): number => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return parseInt(m[1] || "0") * 60 + parseInt(m[2] || "0");
};

export const formatDuration = (iso: ISODuration): string => {
  const min = isoDurationToMinutes(iso);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

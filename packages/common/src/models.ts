/**
 * Domain types using Schema.org vocabulary (https://schema.org/Recipe).
 * These describe the JSON the API returns (see apps/server/src/lib/mappers.ts),
 * so server mappers and web components/hooks share one set of types.
 */
import type {
  HouseholdType,
  InvitableRole,
  InvitationStatus,
  MealType,
  MemberRole,
  PantryLocation,
} from "./enums.js";
import type { RecipeInstruction } from "./recipe-instructions.js";
import type { ISODuration } from "./duration.js";

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
  location: PantryLocation;
}

/** Meal plan entry — Schema.org "PlanAction" style. */
export interface PlannedMeal {
  identifier: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
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
    role: MemberRole;
    avatarColor: string;
  }[];
  invitations: {
    id: string;
    email: string;
    /** Never Owner — an invite can only grant a role from INVITABLE_ROLES. */
    role: InvitableRole;
    status: Exclude<InvitationStatus, "Accepted">;
    sentAt: string;
  }[];
}

/** A pending invitation addressed to the current user (shown in onboarding + switcher). */
export interface PendingInvitation {
  id: string;
  household: HouseholdSummary;
  inviterName: string;
  role: MemberRole;
  sentAt: string;
}

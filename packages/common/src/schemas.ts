/**
 * Zod schemas for API request bodies. The server routes parse incoming JSON
 * with these; the web app can reuse them for client-side form validation.
 */
import { z } from "zod";
import { ACCESS_TOKEN_SCOPES, HOUSEHOLD_TYPES, MEAL_TYPES, PANTRY_LOCATIONS } from "./enums.js";
import { isRecord } from "./schema-json.js";

// --- auth ---

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// --- households ---

export const householdCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(HOUSEHOLD_TYPES),
});

export const activeHouseholdSchema = z.object({ householdId: z.string().min(1) });

export const householdUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(HOUSEHOLD_TYPES).optional(),
});

export const householdInviteSchema = z.object({ email: z.string().trim().toLowerCase().email() });

// --- access tokens ---

export const accessTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(ACCESS_TOKEN_SCOPES)).min(1).default(["read"]),
  expiresAt: z.string().datetime().nullish(),
});

// --- meals ---

export const mealCreateSchema = z.object({
  date: z.string().min(1),
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.string().min(1),
  servings: z.number().int().positive().default(1),
  assignee: z.string().optional(),
});

export const mealUpdateSchema = z
  .object({
    date: z.string().min(1),
    mealType: z.enum(MEAL_TYPES),
    recipeId: z.string().min(1),
    servings: z.number().int().positive(),
    assignee: z.string().nullable(),
  })
  .partial();

// --- pantry ---

const pantryQuantity = z.object({
  value: z.number(),
  unitText: z.string(),
});

export const pantryItemCreateSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().default(""),
  quantity: pantryQuantity.default({ value: 0, unitText: "" }),
  expires: z.string().nullish(),
  location: z.enum(PANTRY_LOCATIONS).default("Pantry"),
});

export const pantryItemUpdateSchema = z
  .object({
    name: z.string().trim().min(1),
    category: z.string(),
    quantity: pantryQuantity,
    expires: z.string().nullable(),
    location: z.enum(PANTRY_LOCATIONS),
  })
  .partial();

// --- shopping ---

export const shoppingItemCreateSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.string().default(""),
  category: z.string().default(""),
  checked: z.boolean().default(false),
  fromRecipeId: z.string().optional(),
});

export const shoppingItemUpdateSchema = z
  .object({
    name: z.string().trim().min(1),
    quantity: z.string(),
    category: z.string(),
    checked: z.boolean(),
    fromRecipeId: z.string().nullable(),
  })
  .partial();

export const shoppingCheckedUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  checked: z.boolean(),
});

// --- recipes ---

const nutritionSchema = z
  .object({
    "@type": z.literal("NutritionInformation").optional(),
    calories: z.string().optional(),
    proteinContent: z.string().optional(),
    carbohydrateContent: z.string().optional(),
    fatContent: z.string().optional(),
  })
  .nullish();

const optionalString = z
  .unknown()
  .transform((value) => (typeof value === "string" ? value : undefined));

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
export const recipeInputSchema = z.object({
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

export type ParsedRecipeInput = z.infer<typeof recipeInputSchema>;

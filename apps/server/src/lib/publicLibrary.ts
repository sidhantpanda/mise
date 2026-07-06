import { z } from "zod";
import type { Prisma, Recipe as PrismaRecipe } from "@prisma/client";
import { recipeInputSchema, type PublicRecipeSummary } from "common";
import { env } from "../env.js";
import { AppError } from "./AppError.js";
import { recipeBody, toColumns } from "./recipes.js";
import { toRecipeDTO } from "./mappers.js";

// Shape of each entry in the public library's list.json. Extra fields are
// ignored; only what the browse UI needs is pulled through.
const listItemSchema = z.object({
  name: z.string(),
  time: z.string().optional().default(""),
  cuisine: z.string().optional().default(""),
  meal_type: z.string().optional().default(""),
  short_desc: z.string().optional().default(""),
  image_url: z.string().optional().default(""),
  file_location: z.string(),
});

const listSchema = z.object({
  all_recipes: z.array(listItemSchema),
});

type ListItem = z.infer<typeof listItemSchema>;

const LIST_TTL_MS = 5 * 60 * 1000;

// In-memory cache of the parsed list so browsing doesn't hit GitHub on every
// request. Also keeps the file_location -> absolute URL map used at import time.
let cache: { fetchedAt: number; items: ListItem[] } | null = null;

async function fetchJson(url: string, context: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new AppError(502, `Could not reach the public recipe library (${context})`);
  }
  if (!res.ok) {
    throw new AppError(502, `Public recipe library returned ${res.status} (${context})`);
  }
  try {
    return await res.json();
  } catch {
    throw new AppError(502, `Public recipe library returned invalid JSON (${context})`);
  }
}

async function loadList(): Promise<ListItem[]> {
  if (cache && Date.now() - cache.fetchedAt < LIST_TTL_MS) return cache.items;

  const raw = await fetchJson(env.PUBLIC_LIBRARY_URL, "index");
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, "Public recipe library index is malformed");
  }
  cache = { fetchedAt: Date.now(), items: parsed.data.all_recipes };
  return cache.items;
}

function toSummary(item: ListItem): PublicRecipeSummary {
  return {
    id: item.file_location,
    name: item.name,
    time: item.time,
    cuisine: item.cuisine,
    mealType: item.meal_type,
    description: item.short_desc,
    imageUrl: item.image_url,
  };
}

export async function listPublicRecipes(): Promise<PublicRecipeSummary[]> {
  const items = await loadList();
  return items.map(toSummary);
}

// Fetch the full Schema.org Recipe JSON-LD for a library entry, identified by its
// file_location (which the browse response exposes as `id`). The id must belong
// to the current index so we only fetch files the library actually vouches for.
export async function fetchPublicRecipe(id: string): Promise<unknown> {
  const items = await loadList();
  const match = items.find((item) => item.file_location === id);
  if (!match) throw new AppError(404, "Recipe is not in the public library");

  const url = new URL(match.file_location, env.PUBLIC_LIBRARY_URL).toString();
  return fetchJson(url, match.name);
}

// Column defaults so a not-yet-persisted public recipe can be run through the
// same toRecipeDTO mapper the stored recipes use — giving the browse preview the
// exact shape (and defaults, e.g. fallback image) as a real recipe page.
const RECIPE_ROW_DEFAULTS = {
  householdId: "",
  name: "",
  description: "",
  image: [] as string[],
  authorName: "",
  datePublished: "",
  prepTime: "",
  cookTime: "",
  performTime: "",
  totalTime: "",
  cookingMethod: "",
  recipeYield: "",
  howToYield: null,
  recipeCategory: "",
  recipeCuisine: "",
  keywords: [] as string[],
  suitableForDiet: [] as string[],
  recipeIngredient: [] as string[],
  recipeInstructions: [] as Prisma.JsonValue,
  estimatedCost: null,
  supply: null,
  tool: null,
  nutrition: null,
  schemaJson: null,
  ratingValue: null,
  ratingCount: null,
  createdById: null,
} satisfies Partial<PrismaRecipe> & Record<string, unknown>;

// Fetch a public recipe and normalize it into the same Recipe DTO the app renders
// for stored recipes — without persisting anything. Used by the browse preview.
export async function fetchPublicRecipeDTO(id: string) {
  const json = await fetchPublicRecipe(id);
  const input = recipeInputSchema.parse(recipeBody(json));
  const columns = toColumns(input) as Prisma.RecipeUncheckedCreateInput;
  const now = new Date();
  const row = {
    ...RECIPE_ROW_DEFAULTS,
    ...columns,
    id,
    createdAt: now,
    updatedAt: now,
  } as unknown as PrismaRecipe;
  return toRecipeDTO(row);
}

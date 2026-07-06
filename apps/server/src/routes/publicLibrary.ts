import { Router } from "express";
import { z } from "zod";
import { createRecipe } from "../lib/recipes.js";
import {
  fetchPublicRecipe,
  fetchPublicRecipeDTO,
  listPublicRecipes,
} from "../lib/publicLibrary.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { AppError } from "../lib/AppError.js";

export const publicLibraryRouter = Router();

// Browse the curated public recipe library. This is a thin, cached proxy over the
// library's list.json so the browser never talks to GitHub directly.
publicLibraryRouter.get("/", async (_req, res) => {
  const recipes = await listPublicRecipes();
  res.json(recipes);
});

// Full recipe preview for the browse detail page. The id (a library file_location)
// arrives as a query param so its slashes don't need path encoding.
publicLibraryRouter.get("/recipe", async (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) throw new AppError(400, "A recipe id is required");
  const recipe = await fetchPublicRecipeDTO(id);
  res.json(recipe);
});

const importSchema = z.object({ id: z.string().min(1) });

// Import a library recipe into the caller's household. The server fetches the
// full JSON-LD itself and runs it through the same createRecipe path as uploads,
// so validation and indexing are identical.
publicLibraryRouter.post("/import", requireWriteAuth, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "A recipe id is required");

  const recipeJson = await fetchPublicRecipe(parsed.data.id);
  const recipe = await createRecipe({
    body: recipeJson,
    householdId: req.user!.householdId,
    createdById: req.user!.id,
  });
  res.status(201).json({ recipe });
});

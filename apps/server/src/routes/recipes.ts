import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import multer from "multer";
import { findRecipeJsonLds, recipeInputSchema } from "common";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/AppError.js";
import { toRecipeDTO } from "../lib/mappers.js";
import { createRecipe, recipeBody, toColumns, withAuthor } from "../lib/recipes.js";
import {
  indexRecipe,
  isSearchEnabled,
  removeRecipeFromIndex,
  searchRecipes,
} from "../lib/recipeSearch.js";
import { requireWriteAuth } from "../middleware/auth.js";
import { routeParam } from "../lib/request.js";

export const recipesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type UploadDocument = {
  source: string;
  value: unknown;
};

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

recipesRouter.get("/", async (req, res) => {
  const recipes = await prisma.recipe.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
    include: withAuthor,
  });
  res.json(recipes.map(toRecipeDTO));
});

// Full-text recipe search within the caller's household, backed by Meilisearch.
// Meili returns matching ids in relevance order; we hydrate full recipes from
// Postgres (preserving that order) so the response is the same RecipeDTO shape as
// the list endpoint. Registered before "/:id" so "search" isn't read as an id.
recipesRouter.get("/search", async (req, res) => {
  if (!isSearchEnabled()) throw new AppError(503, "Recipe search is not available");
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const offsetParam = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;
  const categoryParam = typeof req.query.category === "string" ? req.query.category : undefined;
  const category = categoryParam && categoryParam !== "All" ? categoryParam : undefined;

  let result;
  try {
    result = await searchRecipes({
      householdId: req.user!.householdId,
      query,
      limit: Number.isFinite(limitParam) ? limitParam : undefined,
      offset: Number.isFinite(offsetParam) ? offsetParam : undefined,
      category,
    });
  } catch {
    throw new AppError(503, "Recipe search is temporarily unavailable");
  }

  const ids = result.hits.map((hit) => hit.id);
  const recipes = ids.length
    ? await prisma.recipe.findMany({
        where: { id: { in: ids }, householdId: req.user!.householdId },
        include: withAuthor,
      })
    : [];
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const hits = ids
    .map((id) => byId.get(id))
    .filter((recipe) => recipe !== undefined)
    .map(toRecipeDTO);

  res.json({ hits, total: result.total, limit: result.limit, offset: result.offset });
});

// Turn a recipe name into a filesystem-safe base for its file inside the export
// zip. Falls back to "recipe" so an unnamed recipe still gets a valid filename.
function recipeFileBase(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "recipe";
}

// Export every recipe in the caller's household as a zip of JSON-LD files (one
// Schema.org Recipe per `.json` file). The zip round-trips through the existing
// `/upload` importer, so a household can back up and restore its whole library.
// Registered before "/:id" so "export" isn't read as an id.
recipesRouter.get("/export", async (req, res) => {
  const recipes = await prisma.recipe.findMany({
    where: { householdId: req.user!.householdId },
    orderBy: { createdAt: "desc" },
    include: withAuthor,
  });

  // fflate happily zips an empty set, but the resulting entry-less archive is
  // rejected by macOS Archive Utility ("empty or contains no readable items"),
  // so surface a clear error instead of handing back a broken download.
  if (recipes.length === 0) {
    throw new AppError(400, "This household has no recipes to export yet.");
  }

  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (const recipe of recipes) {
    const { identifier: _identifier, author, ...dto } = toRecipeDTO(recipe);
    const { identifier: _authorIdentifier, ...authorRest } = author;
    const exportDto = { ...dto, author: authorRest };
    const base = recipeFileBase(exportDto.name);
    let filename = `${base}.json`;
    for (let n = 2; usedNames.has(filename); n++) filename = `${base}-${n}.json`;
    usedNames.add(filename);
    files[filename] = strToU8(JSON.stringify(exportDto, null, 2));
  }

  const zipped = zipSync(files, { level: 6 });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="mise-recipes-${date}.zip"`);
  res.send(Buffer.from(zipped));
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
  const dto = await createRecipe({
    body: req.body,
    householdId: req.user!.householdId,
    createdById: req.user!.id,
  });
  res.status(201).json(dto);
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
      const dto = await createRecipe({
        body: candidate.recipe,
        householdId: req.user!.householdId,
        createdById: req.user!.id,
      });
      created.push(dto);
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
  await indexRecipe(recipe);
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
  await removeRecipeFromIndex(id);
  res.json({ ok: true });
});

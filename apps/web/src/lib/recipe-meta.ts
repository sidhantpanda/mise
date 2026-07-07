import type { Recipe } from "common";

// Shared by the two recipe detail routes' `head()`: builds title/description/og/twitter
// tags from loader data when available, falling back to generic copy otherwise (e.g. the
// loader's best-effort SSR fetch failed, or the recipe hasn't loaded yet).
export function recipeMetaTags(
  recipe: Recipe | undefined,
  fallback: { title: string; description: string },
) {
  const title = recipe ? `${recipe.name} - Mise` : fallback.title;
  const description = recipe?.description ?? fallback.description;
  const image = recipe?.image[0];

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: "summary_large_image" },
    ...(image ? [{ name: "twitter:image", content: image }] : []),
  ];
}

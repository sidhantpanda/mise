const PLACEHOLDER_IMAGES = [
  "/assets/placeholder-1.png",
  "/assets/placeholder-2.png",
  "/assets/placeholder-3.png",
  "/assets/placeholder-4.png",
  "/assets/placeholder-5.png",
  "/assets/placeholder-6.png",
];

// Recipes without a real photo get one of six local placeholders, chosen
// deterministically from the name so the same recipe always shows the same
// stand-in (rather than a random one on every render). This is purely a
// display fallback — the recipe's actual `image` field is never touched.
export function recipeDisplayImage(recipe: { name: string; image: string[] }): string {
  if (recipe.image[0]) return recipe.image[0];

  let hash = 0;
  for (let i = 0; i < recipe.name.length; i++) {
    hash = (Math.imul(31, hash) + recipe.name.charCodeAt(i)) | 0;
  }
  return PLACEHOLDER_IMAGES[Math.abs(hash) % PLACEHOLDER_IMAGES.length];
}

import type { Recipe } from "common";

// A minimal-but-complete Recipe fixture, reused across component/lib tests so
// they don't each re-derive the full Schema.org shape.
export function makeRecipeFixture(overrides: Partial<Recipe> = {}): Recipe {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    identifier: "r1",
    name: "Test Recipe",
    description: "A recipe for testing.",
    image: [],
    author: { "@type": "Person", name: "Test Author", identifier: "u1" },
    datePublished: "2026-01-01",
    prepTime: "PT10M",
    cookTime: "PT20M",
    totalTime: "PT30M",
    recipeYield: "4 servings",
    recipeCategory: "Dinner",
    recipeCuisine: "Italian",
    keywords: [],
    recipeIngredient: ["Salt", "Water"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Combine everything." }],
    ...overrides,
  };
}

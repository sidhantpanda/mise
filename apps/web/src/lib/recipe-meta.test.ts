import { describe, expect, it } from "vitest";
import { makeRecipeFixture } from "../../test/fixtures/recipe";
import { recipeMetaTags } from "./recipe-meta";

const fallback = { title: "Fallback Title", description: "Fallback description" };

describe("recipeMetaTags", () => {
  it("uses the recipe's name and description when loaded", () => {
    const recipe = makeRecipeFixture({ name: "Tomato Soup", description: "Warm and simple." });
    const tags = recipeMetaTags(recipe, fallback);
    expect(tags).toContainEqual({ title: "Tomato Soup - Mise" });
    expect(tags).toContainEqual({ name: "description", content: "Warm and simple." });
  });

  it("falls back to the given title/description when there's no recipe", () => {
    const tags = recipeMetaTags(undefined, fallback);
    expect(tags).toContainEqual({ title: "Fallback Title" });
    expect(tags).toContainEqual({ name: "description", content: "Fallback description" });
    expect(tags.some((t) => "property" in t && t.property === "og:image")).toBe(false);
  });

  it("includes og:image/twitter:image only when the recipe has an image", () => {
    const withImage = recipeMetaTags(
      makeRecipeFixture({ image: ["https://example.test/a.jpg"] }),
      fallback,
    );
    expect(withImage).toContainEqual({
      property: "og:image",
      content: "https://example.test/a.jpg",
    });
    expect(withImage).toContainEqual({
      name: "twitter:image",
      content: "https://example.test/a.jpg",
    });

    const withoutImage = recipeMetaTags(makeRecipeFixture({ image: [] }), fallback);
    expect(withoutImage.some((t) => "property" in t && t.property === "og:image")).toBe(false);
    expect(withoutImage.some((t) => "name" in t && t.name === "twitter:image")).toBe(false);
  });

  it("always sets twitter:card to summary_large_image", () => {
    const tags = recipeMetaTags(makeRecipeFixture(), fallback);
    expect(tags).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
  });
});

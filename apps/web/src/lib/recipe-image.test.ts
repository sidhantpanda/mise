import { describe, expect, it } from "vitest";
import { recipeDisplayImage } from "./recipe-image";

describe("recipeDisplayImage", () => {
  it("uses the recipe's own image when present", () => {
    expect(recipeDisplayImage({ name: "Soup", image: ["https://example.test/soup.jpg"] })).toBe(
      "https://example.test/soup.jpg",
    );
  });

  it("falls back to a deterministic placeholder chosen from the name", () => {
    const first = recipeDisplayImage({ name: "Same Name", image: [] });
    const second = recipeDisplayImage({ name: "Same Name", image: [] });
    expect(first).toBe(second);
    expect(first).toMatch(/^\/assets\/placeholder-\d\.png$/);
  });

  it("different names can pick different placeholders", () => {
    const placeholders = new Set(
      ["Recipe A", "Recipe B", "Recipe C", "Recipe D", "Recipe E", "Recipe F"].map((name) =>
        recipeDisplayImage({ name, image: [] }),
      ),
    );
    // Not guaranteed to hit all six, but a hash over six distinct names landing on
    // only one bucket would indicate the hash is broken.
    expect(placeholders.size).toBeGreaterThan(1);
  });
});

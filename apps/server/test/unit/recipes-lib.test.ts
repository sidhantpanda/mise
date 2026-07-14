import { describe, expect, it } from "vitest";
import { recipeBody, toColumns } from "../../src/lib/recipes.js";
import { recipeInputSchema } from "common";

describe("recipeBody", () => {
  it("accepts an explicit schemaJson field and carries it forward", () => {
    const schemaJson = { "@type": "Recipe", name: "Explicit" };
    const body = recipeBody({ name: "Flat name", schemaJson });
    expect(body.schemaJson).toBe(schemaJson);
  });

  it("finds a bare Recipe node and uses it as both source and schemaJson", () => {
    const node = { "@type": "Recipe", name: "Bare Recipe" };
    const body = recipeBody(node) as Record<string, unknown>;
    expect(body.name).toBe("Bare Recipe");
    expect(body.schemaJson).toBe(node);
  });

  it("finds a recipe inside an @graph document", () => {
    const node = { "@type": "Recipe", name: "Graph Recipe" };
    const body = recipeBody({ "@graph": [{ "@type": "WebPage" }, node] }) as Record<string, unknown>;
    expect(body.name).toBe("Graph Recipe");
    expect(body.schemaJson).toBe(node);
  });

  it("prefers an explicit schemaJson over a discovered node", () => {
    const explicit = { "@type": "Recipe", name: "Explicit wins" };
    const discovered = { "@type": "Recipe", name: "Discovered" };
    const body = recipeBody({
      name: "Flat",
      schemaJson: explicit,
      "@graph": [discovered],
    }) as Record<string, unknown>;
    expect(body.schemaJson).toBe(explicit);
    // Source is the raw body itself when schemaJson is explicit, not the discovered node.
    expect(body.name).toBe("Flat");
  });
});

describe("toColumns", () => {
  it("only emits keys that are actually present", () => {
    const input = recipeInputSchema.parse({ name: "Soup" });
    const columns = toColumns(input);
    expect(columns).toHaveProperty("name", "Soup");
    // An absent field must not appear at all, or a PATCH would blank it out.
    expect(columns).not.toHaveProperty("description");
    expect(columns).not.toHaveProperty("recipeIngredient");
  });

  it("explicitly nulls both rating columns when aggregateRating is null", () => {
    const input = recipeInputSchema.parse({ name: "Soup", aggregateRating: null });
    const columns = toColumns(input);
    expect(columns.ratingValue).toBeNull();
    expect(columns.ratingCount).toBeNull();
  });

  it("maps yield to the howToYield column", () => {
    const input = recipeInputSchema.parse({ name: "Soup", yield: "4 servings" });
    const columns = toColumns(input);
    expect(columns.howToYield).toBe("4 servings");
  });
});

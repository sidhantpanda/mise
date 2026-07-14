import { describe, expect, it } from "vitest";
import type { Recipe as PrismaRecipe } from "@prisma/client";
import { toMealDTO, toPantryDTO, toRecipeDTO, toShoppingDTO } from "../../src/lib/mappers.js";

type Recipe = PrismaRecipe & { createdBy?: { displayName: string } | null };

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    householdId: "h1",
    name: "",
    description: "",
    image: [],
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
    keywords: [],
    suitableForDiet: [],
    recipeIngredient: [],
    recipeInstructions: [],
    estimatedCost: null,
    supply: null,
    tool: null,
    nutrition: null,
    schemaJson: null,
    ratingValue: null,
    ratingCount: null,
    createdById: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    createdBy: null,
    ...overrides,
  } as Recipe;
}

describe("toRecipeDTO", () => {
  it("prefers the column value over the schemaJson value", () => {
    const dto = toRecipeDTO(
      makeRecipe({ name: "Column Name", schemaJson: { name: "Schema Name" } }),
    );
    expect(dto.name).toBe("Column Name");
  });

  it("falls back to the schemaJson value when the column is empty", () => {
    const dto = toRecipeDTO(makeRecipe({ name: "", schemaJson: { name: "Schema Name" } }));
    expect(dto.name).toBe("Schema Name");
  });

  it("builds aggregateRating from ratingValue/ratingCount only when both are non-null", () => {
    const dto = toRecipeDTO(makeRecipe({ ratingValue: 4.5, ratingCount: 10 }));
    expect(dto.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      ratingCount: 10,
    });
  });

  it("falls back to schemaJson.aggregateRating when either rating column is null", () => {
    const schemaRating = { "@type": "AggregateRating", ratingValue: 3, ratingCount: 2 };
    const dto = toRecipeDTO(
      makeRecipe({ ratingValue: null, ratingCount: null, schemaJson: { aggregateRating: schemaRating } }),
    );
    expect(dto.aggregateRating).toEqual(schemaRating);

    const dtoPartial = toRecipeDTO(
      makeRecipe({
        ratingValue: 4,
        ratingCount: null,
        schemaJson: { aggregateRating: schemaRating },
      }),
    );
    expect(dtoPartial.aggregateRating).toEqual(schemaRating);
  });

  it("prefers the joined createdBy.displayName over the denormalized authorName", () => {
    const dto = toRecipeDTO(
      makeRecipe({ authorName: "Old Name", createdById: "u1", createdBy: { displayName: "New Name" } }),
    );
    expect(dto.author.name).toBe("New Name");
  });

  it("falls back to authorName when there is no joined createdBy", () => {
    const dto = toRecipeDTO(makeRecipe({ authorName: "Denormalized Name", createdBy: null }));
    expect(dto.author.name).toBe("Denormalized Name");
  });

  it("author.identifier is undefined when createdById is null", () => {
    const dto = toRecipeDTO(makeRecipe({ createdById: null }));
    expect(dto.author.identifier).toBeUndefined();
  });

  it("always normalizes recipeInstructions", () => {
    const dto = toRecipeDTO(makeRecipe({ recipeInstructions: "Step one. Step two." as never }));
    expect(dto.recipeInstructions).toEqual([{ "@type": "HowToStep", text: "Step one. Step two." }]);
  });
});

describe("toPantryDTO", () => {
  it("maps quantity and nulls expires to undefined", () => {
    const dto = toPantryDTO({
      id: "p1",
      householdId: "h1",
      name: "Rice",
      category: "Grains",
      quantityValue: 2,
      quantityUnit: "kg",
      expires: null,
      location: "Pantry",
      createdAt: new Date(),
    } as never);
    expect(dto.quantity).toEqual({ "@type": "QuantitativeValue", value: 2, unitText: "kg" });
    expect(dto.expires).toBeUndefined();
  });
});

describe("toMealDTO", () => {
  it("maps a null recipeId to an empty string and a null assigneeId to undefined", () => {
    const dto = toMealDTO({
      id: "m1",
      householdId: "h1",
      date: "2026-01-01",
      mealType: "Dinner",
      recipeId: null,
      servings: 2,
      assigneeId: null,
      createdAt: new Date(),
    } as never);
    expect(dto.recipeId).toBe("");
    expect(dto.assignee).toBeUndefined();
  });
});

describe("toShoppingDTO", () => {
  it("maps a null fromRecipeId to undefined", () => {
    const dto = toShoppingDTO({
      id: "s1",
      householdId: "h1",
      name: "Milk",
      quantity: "1L",
      category: "Dairy",
      checked: false,
      fromRecipeId: null,
      createdAt: new Date(),
    } as never);
    expect(dto.fromRecipeId).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { keys, meKey } from "./keys";

describe("query key factory", () => {
  it("static keys are stable across calls", () => {
    expect(keys.recipes).toEqual(["recipes"]);
    expect(keys.meals).toEqual(["meals"]);
    expect(keys.shopping).toEqual(["shopping"]);
    expect(keys.pantry).toEqual(["pantry"]);
    expect(keys.household).toEqual(["household"]);
    expect(keys.accessTokens).toEqual(["access-tokens"]);
    expect(meKey).toEqual(["me"]);
  });

  it("recipe(id) produces a distinct key per id", () => {
    expect(keys.recipe("a")).toEqual(["recipes", "a"]);
    expect(keys.recipe("b")).toEqual(["recipes", "b"]);
    expect(keys.recipe("a")).not.toBe(keys.recipe("a")); // new array each call
    expect(keys.recipe("a")).not.toEqual(keys.recipe("b"));
  });

  it("recipe(id) never collides with the static recipes list key", () => {
    // A collision here would cross-wire the list cache with a single recipe's
    // cache — the exact bug this factory exists to prevent.
    expect(keys.recipe("recipes")).not.toEqual(keys.recipes);
  });

  it("recipeSearch distinguishes query and category, and defaults category to empty", () => {
    expect(keys.recipeSearch("soup")).toEqual(["recipes", "search", "soup", ""]);
    expect(keys.recipeSearch("soup", "Dinner")).toEqual(["recipes", "search", "soup", "Dinner"]);
    expect(keys.recipeSearch("soup")).not.toEqual(keys.recipeSearch("salad"));
    expect(keys.recipeSearch("soup", "Dinner")).not.toEqual(keys.recipeSearch("soup", "Lunch"));
  });

  it("publicRecipe(id) is distinct from recipe(id) despite sharing an id space", () => {
    expect(keys.publicRecipe("a")).toEqual(["public-library", "recipe", "a"]);
    expect(keys.publicRecipe("a")).not.toEqual(keys.recipe("a") as unknown);
  });
});

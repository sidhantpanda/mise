import { describe, expect, it } from "vitest";
import { isRecipeLayout, RecipeLayout } from "./recipe-layout";

describe("isRecipeLayout", () => {
  it("accepts every enum value", () => {
    expect(isRecipeLayout(RecipeLayout.Grid)).toBe(true);
    expect(isRecipeLayout(RecipeLayout.Compact)).toBe(true);
    expect(isRecipeLayout(RecipeLayout.List)).toBe(true);
    expect(isRecipeLayout(RecipeLayout.Table)).toBe(true);
  });

  it("rejects an unrelated string", () => {
    expect(isRecipeLayout("carousel")).toBe(false);
  });

  it("rejects null (e.g. an absent search param)", () => {
    expect(isRecipeLayout(null)).toBe(false);
  });
});

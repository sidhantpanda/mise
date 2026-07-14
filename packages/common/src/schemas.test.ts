import { describe, expect, it } from "vitest";
import {
  accessTokenCreateSchema,
  loginSchema,
  mealCreateSchema,
  recipeInputSchema,
  signupSchema,
} from "./schemas.js";

describe("signupSchema", () => {
  it("lowercases and trims the email", () => {
    const parsed = signupSchema.parse({
      name: "Ada",
      email: "  ADA@Example.com  ",
      password: "password123",
    });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("enforces an 8-char password minimum", () => {
    expect(() =>
      signupSchema.parse({ name: "Ada", email: "ada@example.com", password: "short" }),
    ).toThrow();
    expect(
      signupSchema.parse({ name: "Ada", email: "ada@example.com", password: "exactly8" }).password,
    ).toBe("exactly8");
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password (no minimum length)", () => {
    expect(
      loginSchema.parse({ email: "ada@example.com", password: "x" }).password,
    ).toBe("x");
  });

  it("rejects an empty password", () => {
    expect(() => loginSchema.parse({ email: "ada@example.com", password: "" })).toThrow();
  });
});

describe("mealCreateSchema", () => {
  it("defaults servings to 1", () => {
    const parsed = mealCreateSchema.parse({
      date: "2026-01-01",
      mealType: "Dinner",
      recipeId: "r1",
    });
    expect(parsed.servings).toBe(1);
  });

  it("rejects zero or negative servings", () => {
    expect(() =>
      mealCreateSchema.parse({
        date: "2026-01-01",
        mealType: "Dinner",
        recipeId: "r1",
        servings: 0,
      }),
    ).toThrow();
    expect(() =>
      mealCreateSchema.parse({
        date: "2026-01-01",
        mealType: "Dinner",
        recipeId: "r1",
        servings: -1,
      }),
    ).toThrow();
  });

  it("rejects an unknown mealType", () => {
    expect(() =>
      mealCreateSchema.parse({ date: "2026-01-01", mealType: "Brunch", recipeId: "r1" }),
    ).toThrow();
  });
});

describe("accessTokenCreateSchema", () => {
  it("defaults scopes to [read]", () => {
    expect(accessTokenCreateSchema.parse({ name: "My token" }).scopes).toEqual(["read"]);
  });

  it("rejects an empty scopes array", () => {
    expect(() => accessTokenCreateSchema.parse({ name: "My token", scopes: [] })).toThrow();
  });

  it("rejects an unknown scope", () => {
    expect(() =>
      accessTokenCreateSchema.parse({ name: "My token", scopes: ["admin"] }),
    ).toThrow();
  });
});

describe("recipeInputSchema", () => {
  it("accepts a full Schema.org recipe", () => {
    const parsed = recipeInputSchema.parse({
      name: "Soup",
      description: "Warm and comforting",
      recipeIngredient: ["Water", "Salt"],
      recipeInstructions: "Boil water. Add salt.",
      recipeYield: "4 servings",
      author: { name: "Ada" },
    });
    expect(parsed.name).toBe("Soup");
    expect(parsed.author).toEqual({ name: "Ada" });
  });

  it("tolerates unknown extra keys", () => {
    const parsed = recipeInputSchema.parse({ name: "Soup", extraField: "ignored" });
    expect(parsed.name).toBe("Soup");
    expect((parsed as Record<string, unknown>).extraField).toBeUndefined();
  });
});

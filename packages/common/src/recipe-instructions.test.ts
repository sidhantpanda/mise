import { describe, expect, it } from "vitest";
import { normalizeRecipeInstructions } from "./recipe-instructions.js";

describe("normalizeRecipeInstructions", () => {
  it("turns a plain string into one HowToStep", () => {
    expect(normalizeRecipeInstructions("Mix everything together.")).toEqual([
      { "@type": "HowToStep", text: "Mix everything together." },
    ]);
  });

  it("turns a whitespace-only string into an empty array", () => {
    expect(normalizeRecipeInstructions("   ")).toEqual([]);
  });

  it("handles an array of plain strings", () => {
    expect(normalizeRecipeInstructions(["Chop onions.", "Boil water."])).toEqual([
      { "@type": "HowToStep", text: "Chop onions." },
      { "@type": "HowToStep", text: "Boil water." },
    ]);
  });

  it("handles an array of HowToStep objects", () => {
    const input = [
      { "@type": "HowToStep", text: "Step A" },
      { "@type": "HowToStep", text: "Step B" },
    ];
    expect(normalizeRecipeInstructions(input)).toEqual([
      { "@type": "HowToStep", text: "Step A" },
      { "@type": "HowToStep", text: "Step B" },
    ]);
  });

  it("preserves a HowToSection with nested itemListElement", () => {
    const input = {
      "@type": "HowToSection",
      name: "Prep",
      itemListElement: [
        { "@type": "HowToStep", text: "Chop onions." },
        { "@type": "HowToStep", text: "Boil water." },
      ],
    };
    expect(normalizeRecipeInstructions(input)).toEqual([
      {
        "@type": "HowToSection",
        name: "Prep",
        itemListElement: [
          { "@type": "HowToStep", text: "Chop onions." },
          { "@type": "HowToStep", text: "Boil water." },
        ],
      },
    ]);
  });

  it("promotes a section with a name but no @type to HowToSection", () => {
    const input = { name: "Prep", itemListElement: ["Chop onions.", "Boil water."] };
    expect(normalizeRecipeInstructions(input)).toEqual([
      {
        "@type": "HowToSection",
        name: "Prep",
        itemListElement: [
          { "@type": "HowToStep", text: "Chop onions." },
          { "@type": "HowToStep", text: "Boil water." },
        ],
      },
    ]);
  });

  it("flattens a bare object with itemListElement and no name to its steps", () => {
    const input = { itemListElement: ["Chop onions.", "Boil water."] };
    expect(normalizeRecipeInstructions(input)).toEqual([
      { "@type": "HowToStep", text: "Chop onions." },
      { "@type": "HowToStep", text: "Boil water." },
    ]);
  });

  // normalizeStep deliberately collapses one level: a section nested inside another
  // section is flattened down to its steps, losing the inner section's own name.
  it("flattens nested sections inside sections by one level", () => {
    const input = {
      "@type": "HowToSection",
      name: "Outer",
      itemListElement: [
        {
          "@type": "HowToSection",
          name: "Inner",
          itemListElement: [
            { "@type": "HowToStep", text: "Step 1" },
            { "@type": "HowToStep", text: "Step 2" },
          ],
        },
      ],
    };
    expect(normalizeRecipeInstructions(input)).toEqual([
      {
        "@type": "HowToSection",
        name: "Outer",
        itemListElement: [
          { "@type": "HowToStep", text: "Step 1" },
          { "@type": "HowToStep", text: "Step 2" },
        ],
      },
    ]);
  });

  it("returns an empty array for an object with neither text nor itemListElement", () => {
    expect(normalizeRecipeInstructions({ foo: "bar" })).toEqual([]);
    expect(normalizeRecipeInstructions({})).toEqual([]);
  });

  it("returns an empty array for null, undefined, and numbers", () => {
    expect(normalizeRecipeInstructions(null)).toEqual([]);
    expect(normalizeRecipeInstructions(undefined)).toEqual([]);
    expect(normalizeRecipeInstructions(42)).toEqual([]);
  });

  it("trims a step's name", () => {
    expect(normalizeRecipeInstructions({ name: "  Mix  ", text: "Mix ingredients." })).toEqual([
      { "@type": "HowToStep", name: "Mix", text: "Mix ingredients." },
    ]);
  });

  it("drops a blank name rather than emitting an empty string", () => {
    expect(normalizeRecipeInstructions({ name: "   ", text: "Mix ingredients." })).toEqual([
      { "@type": "HowToStep", text: "Mix ingredients." },
    ]);
  });
});

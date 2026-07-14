import { describe, expect, it } from "vitest";
import {
  asString,
  asStringArray,
  compactObject,
  findRecipeJsonLd,
  findRecipeJsonLds,
  isRecipeNode,
  isRecord,
} from "./schema-json.js";

describe("isRecord", () => {
  it("accepts a plain object", () => {
    expect(isRecord({})).toBe(true);
  });

  it("rejects arrays", () => {
    expect(isRecord([])).toBe(false);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isRecord("x")).toBe(false);
    expect(isRecord(1)).toBe(false);
  });
});

describe("asString", () => {
  it("passes through a string", () => {
    expect(asString("hi")).toBe("hi");
  });

  it("returns undefined for anything else", () => {
    expect(asString(1)).toBeUndefined();
    expect(asString(undefined)).toBeUndefined();
    expect(asString(null)).toBeUndefined();
  });
});

describe("asStringArray", () => {
  it("filters an array down to its string entries", () => {
    expect(asStringArray(["a", 1, "b", null])).toEqual(["a", "b"]);
  });

  it("wraps a bare string in an array", () => {
    expect(asStringArray("solo")).toEqual(["solo"]);
  });

  it("returns undefined for anything else", () => {
    expect(asStringArray(1)).toBeUndefined();
    expect(asStringArray(null)).toBeUndefined();
  });
});

describe("isRecipeNode", () => {
  it("accepts @type: Recipe", () => {
    expect(isRecipeNode({ "@type": "Recipe" })).toBe(true);
  });

  it("accepts @type as an array containing Recipe", () => {
    expect(isRecipeNode({ "@type": ["Recipe", "Thing"] })).toBe(true);
  });

  it("rejects an unrelated type", () => {
    expect(isRecipeNode({ "@type": "Thing" })).toBe(false);
  });

  it("rejects non-records", () => {
    expect(isRecipeNode(null)).toBe(false);
    expect(isRecipeNode([{ "@type": "Recipe" }])).toBe(false);
  });
});

describe("findRecipeJsonLd", () => {
  it("finds a bare recipe node", () => {
    const node = { "@type": "Recipe", name: "Soup" };
    expect(findRecipeJsonLd(node)).toBe(node);
  });

  it("finds a recipe nested inside @graph", () => {
    const node = { "@type": "Recipe", name: "Soup" };
    const doc = { "@graph": [{ "@type": "WebPage" }, node] };
    expect(findRecipeJsonLd(doc)).toBe(node);
  });

  it("returns undefined when there is no recipe", () => {
    expect(findRecipeJsonLd({ "@graph": [{ "@type": "WebPage" }] })).toBeUndefined();
    expect(findRecipeJsonLd({})).toBeUndefined();
    expect(findRecipeJsonLd(null)).toBeUndefined();
  });
});

describe("findRecipeJsonLds", () => {
  it("returns every match from an @graph", () => {
    const a = { "@type": "Recipe", name: "A" };
    const b = { "@type": "Recipe", name: "B" };
    const doc = { "@graph": [{ "@type": "WebPage" }, a, b] };
    expect(findRecipeJsonLds(doc)).toEqual([a, b]);
  });

  it("flattens nested arrays", () => {
    const a = { "@type": "Recipe", name: "A" };
    const b = { "@type": "Recipe", name: "B" };
    expect(findRecipeJsonLds([[a], [b]])).toEqual([a, b]);
  });

  it("returns a single-element array for a bare recipe node", () => {
    const a = { "@type": "Recipe", name: "A" };
    expect(findRecipeJsonLds(a)).toEqual([a]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(findRecipeJsonLds({ "@graph": [{ "@type": "WebPage" }] })).toEqual([]);
    expect(findRecipeJsonLds(null)).toEqual([]);
  });
});

describe("compactObject", () => {
  it("strips undefined, null, empty string, and empty array", () => {
    expect(
      compactObject({
        a: undefined,
        b: null,
        c: "",
        d: [] as string[],
        e: "kept",
      }),
    ).toEqual({ e: "kept" });
  });

  // This asymmetry is load-bearing in toRecipeDTO: a rating of 0, or a false flag,
  // must survive compaction rather than being treated as "absent".
  it("keeps false and 0", () => {
    expect(compactObject({ flag: false, count: 0 })).toEqual({ flag: false, count: 0 });
  });
});

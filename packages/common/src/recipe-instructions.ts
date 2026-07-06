import { isRecord } from "./schema-json.js";

export type HowToStep = {
  "@type": "HowToStep";
  name?: string;
  text: string;
};

export type HowToSection = {
  "@type": "HowToSection";
  name?: string;
  itemListElement: HowToStep[];
};

export type RecipeInstruction = HowToStep | HowToSection;

function optionalName(value: Record<string, unknown>) {
  return typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined;
}

function normalizeStep(value: unknown): HowToStep[] {
  return normalizeRecipeInstructions(value).flatMap((instruction) =>
    instruction["@type"] === "HowToSection" ? instruction.itemListElement : [instruction],
  );
}

export function normalizeRecipeInstructions(value: unknown): RecipeInstruction[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ "@type": "HowToStep", text }] : [];
  }

  if (Array.isArray(value)) return value.flatMap(normalizeRecipeInstructions);
  if (!isRecord(value)) return [];

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text) {
    return [
      { "@type": "HowToStep", ...(optionalName(value) ? { name: optionalName(value) } : {}), text },
    ];
  }

  const steps = normalizeStep(value.itemListElement);
  if (steps.length === 0) return [];

  if (value["@type"] === "HowToSection" || optionalName(value)) {
    return [
      {
        "@type": "HowToSection",
        ...(optionalName(value) ? { name: optionalName(value) } : {}),
        itemListElement: steps,
      },
    ];
  }

  return steps;
}

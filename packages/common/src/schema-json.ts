// Helpers for working with loosely-typed Schema.org JSON-LD documents.

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : undefined;
};

export function isRecipeNode(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const type = value["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

export function findRecipeJsonLd(value: unknown): Record<string, unknown> | undefined {
  if (isRecipeNode(value)) return value;
  if (!isRecord(value)) return undefined;

  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    return graph.find(isRecipeNode) as Record<string, unknown> | undefined;
  }

  return undefined;
}

export function findRecipeJsonLds(value: unknown): Record<string, unknown>[] {
  if (isRecipeNode(value)) return [value];

  if (Array.isArray(value)) {
    return value.flatMap(findRecipeJsonLds);
  }

  if (!isRecord(value)) return [];

  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    return graph.filter(isRecipeNode) as Record<string, unknown>[];
  }

  return [];
}

export function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === "string") return entry.length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    }),
  ) as Partial<T>;
}

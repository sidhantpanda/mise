export const keys = {
  recipes: ["recipes"] as const,
  recipe: (id: string) => ["recipes", id] as const,
  meals: ["meals"] as const,
  shopping: ["shopping"] as const,
  pantry: ["pantry"] as const,
  household: ["household"] as const,
  accessTokens: ["access-tokens"] as const,
};

export const meKey = ["me"] as const;

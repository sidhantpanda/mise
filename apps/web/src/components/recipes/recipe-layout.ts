export enum RecipeLayout {
  Grid = "grid",
  Compact = "compact",
  List = "list",
  Table = "table",
}

export const isRecipeLayout = (value: string | null): value is RecipeLayout =>
  Object.values(RecipeLayout).some((layout) => layout === value);

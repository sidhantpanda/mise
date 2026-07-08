import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, isoDurationToMinutes, type Recipe } from "common";
import { RecipeCtaTableRow, type RecipeCta } from "@/components/recipes/recipe-cta-card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { recipeDisplayImage } from "@/lib/recipe-image";

enum RecipeTableSortKey {
  Recipe = "recipe",
  Cuisine = "cuisine",
  Category = "category",
  TotalTime = "totalTime",
  Servings = "servings",
  Rating = "rating",
}

enum RecipeTableSortDirection {
  Asc = "asc",
  Desc = "desc",
}

type RecipeTableColumn = {
  key: RecipeTableSortKey;
  label: string;
  className?: string;
  align?: "right";
};

const recipeTableColumns: RecipeTableColumn[] = [
  { key: RecipeTableSortKey.Recipe, label: "Recipe", className: "w-[38%] px-4" },
  { key: RecipeTableSortKey.Cuisine, label: "Cuisine" },
  { key: RecipeTableSortKey.Category, label: "Category" },
  { key: RecipeTableSortKey.TotalTime, label: "Total time" },
  { key: RecipeTableSortKey.Servings, label: "Servings" },
  { key: RecipeTableSortKey.Rating, label: "Rating", align: "right" },
] as const;

type RecipeTableSort = {
  key: RecipeTableSortKey;
  direction: RecipeTableSortDirection;
};

export function RecipeTable({ recipes, cta }: { recipes: Recipe[]; cta?: RecipeCta }) {
  const [sort, setSort] = useState<RecipeTableSort>({
    key: RecipeTableSortKey.Recipe,
    direction: RecipeTableSortDirection.Asc,
  });

  const sortedRecipes = useMemo(() => sortRecipesForTable(recipes, sort), [recipes, sort]);

  const selectSort = (key: RecipeTableSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === RecipeTableSortDirection.Asc
          ? RecipeTableSortDirection.Desc
          : RecipeTableSortDirection.Asc,
    }));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {recipeTableColumns.map((column) => (
              <SortableTableHead
                key={column.key}
                columnKey={column.key}
                label={column.label}
                sort={sort}
                onSort={selectSort}
                className={column.className}
                align={column.align}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRecipes.map((recipe) => (
            <TableRow key={recipe.identifier}>
              <TableCell className="px-4">
                <Link
                  to="/recipes/$id"
                  params={{ id: recipe.identifier }}
                  className="group flex min-w-72 items-center gap-3"
                >
                  <img
                    src={recipeDisplayImage(recipe)}
                    alt={recipe.name}
                    className="size-12 shrink-0 rounded-md object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:text-primary">
                      {recipe.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {recipe.description}
                    </span>
                  </span>
                </Link>
              </TableCell>
              <TableCell>{recipe.recipeCuisine}</TableCell>
              <TableCell>{recipe.recipeCategory}</TableCell>
              <TableCell>{formatDuration(recipe.totalTime)}</TableCell>
              <TableCell>{recipe.recipeYield}</TableCell>
              <TableCell className="text-right">
                {recipe.aggregateRating ? (
                  <span className="inline-flex items-center justify-end gap-1 text-foreground">
                    <Star className="size-3.5 fill-accent text-accent" />
                    {recipe.aggregateRating.ratingValue}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {cta && <RecipeCtaTableRow cta={cta} colSpan={recipeTableColumns.length} />}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableTableHead({
  columnKey,
  label,
  sort,
  onSort,
  className,
  align,
}: {
  columnKey: RecipeTableSortKey;
  label: string;
  sort: RecipeTableSort;
  onSort: (key: RecipeTableSortKey) => void;
  className?: string;
  align?: "right";
}) {
  const active = sort.key === columnKey;
  const Icon = active
    ? sort.direction === RecipeTableSortDirection.Asc
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={
        active
          ? sort.direction === RecipeTableSortDirection.Asc
            ? "ascending"
            : "descending"
          : "none"
      }
      className={cn(className, align === "right" && "text-right")}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSort(columnKey)}
        className={cn(
          "h-8 gap-1.5 rounded-md p-0 text-left text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3.5",
          active && "text-foreground",
          align === "right" && "ml-auto justify-end",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3.5" />
      </Button>
    </TableHead>
  );
}

function sortRecipesForTable(recipes: Recipe[], sort: RecipeTableSort) {
  return [...recipes].sort((a, b) => {
    const aValue = getRecipeTableSortValue(a, sort.key);
    const bValue = getRecipeTableSortValue(b, sort.key);

    if (aValue == null && bValue == null) return compareText(a.name, b.name);
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : compareText(String(aValue), String(bValue));

    if (comparison !== 0) {
      return sort.direction === RecipeTableSortDirection.Asc ? comparison : -comparison;
    }

    return compareText(a.name, b.name);
  });
}

function getRecipeTableSortValue(recipe: Recipe, key: RecipeTableSortKey): string | number | null {
  switch (key) {
    case RecipeTableSortKey.Recipe:
      return recipe.name;
    case RecipeTableSortKey.Cuisine:
      return recipe.recipeCuisine;
    case RecipeTableSortKey.Category:
      return recipe.recipeCategory;
    case RecipeTableSortKey.TotalTime:
      return isoDurationToMinutes(recipe.totalTime);
    case RecipeTableSortKey.Servings:
      return parseRecipeYield(recipe.recipeYield);
    case RecipeTableSortKey.Rating:
      return recipe.aggregateRating?.ratingValue ?? null;
  }
}

function parseRecipeYield(recipeYield: string): number | null {
  const values = Array.from(recipeYield.matchAll(/\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  if (values.length === 0) return null;
  if (values.length > 1 && /\bto\b|-/.test(recipeYield.toLowerCase())) {
    return (values[0] + values[1]) / 2;
  }
  return values[0];
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

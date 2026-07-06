import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecipeLayout } from "@/components/recipes/recipe-layout";
import { publicRecipeSlug } from "@/hooks";
import { useImportPublicRecipe } from "@/hooks/mutations";
import type { PublicRecipeSummary } from "common";
import { cn } from "@/lib/utils";

type LayoutViewProps = {
  recipes: PublicRecipeSummary[];
  importedIds: Set<string>;
  onImported: (id: string) => void;
};

type LayoutProps = LayoutViewProps & { layout: RecipeLayout };

export function PublicRecipesLayout({ recipes, layout, importedIds, onImported }: LayoutProps) {
  if (recipes.length === 0) return null;

  const shared = { importedIds, onImported };
  if (layout === RecipeLayout.Compact) return <CompactGrid recipes={recipes} {...shared} />;
  if (layout === RecipeLayout.List) return <RecipeList recipes={recipes} {...shared} />;
  if (layout === RecipeLayout.Table) return <RecipeTable recipes={recipes} {...shared} />;
  return <RecipeGrid recipes={recipes} {...shared} />;
}

// Preview link + import mutation are the same across every layout, so both live in
// one button. The imported flag is owned by the page so it survives layout swaps.
function ImportButton({
  recipe,
  imported,
  onImported,
  size = "default",
}: {
  recipe: PublicRecipeSummary;
  imported: boolean;
  onImported: (id: string) => void;
  size?: "default" | "sm";
}) {
  const importRecipe = useImportPublicRecipe();

  const onImport = async () => {
    try {
      await importRecipe.mutateAsync(recipe.id);
      onImported(recipe.id);
      toast.success(`Imported "${recipe.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  return (
    <button
      type="button"
      onClick={onImport}
      disabled={importRecipe.isPending || imported}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60",
        size === "sm" ? "h-8 px-4 text-xs" : "h-9 px-4 text-sm",
      )}
    >
      {imported ? (
        <>
          <Check className={iconSize} /> Imported
        </>
      ) : importRecipe.isPending ? (
        <>
          <Loader2 className={cn(iconSize, "animate-spin")} /> Importing
        </>
      ) : (
        <>
          <Download className={iconSize} /> Import
        </>
      )}
    </button>
  );
}

function PreviewLink({
  recipe,
  className,
  children,
}: {
  recipe: PublicRecipeSummary;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/recipes/library/view"
      search={{ id: publicRecipeSlug(recipe.id) }}
      className={className}
    >
      {children}
    </Link>
  );
}

function Eyebrow({ recipe, className }: { recipe: PublicRecipeSummary; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {recipe.cuisine && <span className="truncate">{recipe.cuisine}</span>}
      {recipe.cuisine && recipe.mealType && <span>·</span>}
      {recipe.mealType && <span className="truncate">{recipe.mealType}</span>}
    </div>
  );
}

function TimeStat({ time, className }: { time: string; className?: string }) {
  if (!time) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Clock className="size-3.5" /> {time}
    </span>
  );
}

function RecipeGrid({ recipes, importedIds, onImported }: LayoutViewProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          <PreviewLink recipe={recipe} className="flex flex-1 flex-col">
            <div className="aspect-[4/3] overflow-hidden bg-secondary">
              {recipe.imageUrl && (
                <img
                  src={recipe.imageUrl}
                  alt={recipe.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col p-4 pb-0 sm:p-5 sm:pb-0">
              <Eyebrow recipe={recipe} />
              <h3 className="mt-2 text-display text-xl leading-tight">{recipe.name}</h3>
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                {recipe.description}
              </p>
            </div>
          </PreviewLink>
          <div className="p-4 pt-4 sm:p-5 sm:pt-4">
            <div className="flex items-center justify-between gap-3">
              <TimeStat time={recipe.time} />
              <ImportButton
                recipe={recipe}
                imported={importedIds.has(recipe.id)}
                onImported={onImported}
                size="sm"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactGrid({ recipes, importedIds, onImported }: LayoutViewProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className="group flex overflow-hidden rounded-lg border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <PreviewLink recipe={recipe} className="flex min-w-0 flex-1">
            <div className="h-24 w-24 shrink-0 overflow-hidden bg-secondary">
              {recipe.imageUrl && (
                <img
                  src={recipe.imageUrl}
                  alt={recipe.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="min-w-0 flex-1 p-3">
              <Eyebrow recipe={recipe} className="text-[10px]" />
              <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
                {recipe.name}
              </h3>
              <TimeStat time={recipe.time} className="mt-2 text-[11px]" />
            </div>
          </PreviewLink>
          <div className="flex items-center p-2">
            <ImportButton
              recipe={recipe}
              imported={importedIds.has(recipe.id)}
              onImported={onImported}
              size="sm"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeList({ recipes, importedIds, onImported }: LayoutViewProps) {
  return (
    <div className="space-y-3">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className="group grid gap-4 rounded-xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:items-center"
        >
          <PreviewLink
            recipe={recipe}
            className="aspect-4/3 overflow-hidden rounded-lg bg-secondary sm:h-24 sm:aspect-auto"
          >
            {recipe.imageUrl && (
              <img
                src={recipe.imageUrl}
                alt={recipe.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}
          </PreviewLink>
          <PreviewLink recipe={recipe} className="min-w-0">
            <Eyebrow recipe={recipe} />
            <h3 className="mt-1 text-display text-xl leading-tight">{recipe.name}</h3>
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {recipe.description}
            </p>
          </PreviewLink>
          <div className="flex items-center justify-between gap-3 sm:w-56 sm:justify-end">
            <TimeStat time={recipe.time} />
            <ImportButton
              recipe={recipe}
              imported={importedIds.has(recipe.id)}
              onImported={onImported}
              size="sm"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

enum SortKey {
  Recipe = "recipe",
  Cuisine = "cuisine",
  MealType = "mealType",
  Time = "time",
}

enum SortDirection {
  Asc = "asc",
  Desc = "desc",
}

type TableSort = { key: SortKey; direction: SortDirection };

const tableColumns: { key: SortKey; label: string; className?: string }[] = [
  { key: SortKey.Recipe, label: "Recipe", className: "w-[42%] px-4" },
  { key: SortKey.Cuisine, label: "Cuisine" },
  { key: SortKey.MealType, label: "Meal type" },
  { key: SortKey.Time, label: "Time" },
];

function RecipeTable({ recipes, importedIds, onImported }: LayoutViewProps) {
  const [sort, setSort] = useState<TableSort>({
    key: SortKey.Recipe,
    direction: SortDirection.Asc,
  });
  const sorted = useMemo(() => sortForTable(recipes, sort), [recipes, sort]);

  const selectSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === SortDirection.Asc
          ? SortDirection.Desc
          : SortDirection.Asc,
    }));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {tableColumns.map((column) => (
              <SortableHead
                key={column.key}
                columnKey={column.key}
                label={column.label}
                sort={sort}
                onSort={selectSort}
                className={column.className}
              />
            ))}
            <TableHead className="text-right">Import</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((recipe) => (
            <TableRow key={recipe.id}>
              <TableCell className="px-4">
                <PreviewLink recipe={recipe} className="group flex min-w-72 items-center gap-3">
                  <img
                    src={recipe.imageUrl}
                    alt={recipe.name}
                    className="size-12 shrink-0 rounded-md bg-secondary object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:text-primary">
                      {recipe.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {recipe.description}
                    </span>
                  </span>
                </PreviewLink>
              </TableCell>
              <TableCell>{recipe.cuisine || "—"}</TableCell>
              <TableCell>{recipe.mealType || "—"}</TableCell>
              <TableCell>{recipe.time || "—"}</TableCell>
              <TableCell className="text-right">
                <ImportButton
                  recipe={recipe}
                  imported={importedIds.has(recipe.id)}
                  onImported={onImported}
                  size="sm"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHead({
  columnKey,
  label,
  sort,
  onSort,
  className,
}: {
  columnKey: SortKey;
  label: string;
  sort: TableSort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === columnKey;
  const Icon = active
    ? sort.direction === SortDirection.Asc
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={
        active ? (sort.direction === SortDirection.Asc ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md text-left text-xs font-medium text-muted-foreground transition hover:text-foreground",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

function sortForTable(recipes: PublicRecipeSummary[], sort: TableSort) {
  return [...recipes].sort((a, b) => {
    const aValue = sortValue(a, sort.key);
    const bValue = sortValue(b, sort.key);

    if (aValue == null && bValue == null) return compareText(a.name, b.name);
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : compareText(String(aValue), String(bValue));

    if (comparison !== 0) {
      return sort.direction === SortDirection.Asc ? comparison : -comparison;
    }
    return compareText(a.name, b.name);
  });
}

function sortValue(recipe: PublicRecipeSummary, key: SortKey): string | number | null {
  switch (key) {
    case SortKey.Recipe:
      return recipe.name;
    case SortKey.Cuisine:
      return recipe.cuisine || null;
    case SortKey.MealType:
      return recipe.mealType || null;
    case SortKey.Time: {
      const match = recipe.time.match(/\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    }
  }
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

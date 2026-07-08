import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell, PrimaryButton, SearchBar } from "@/components/AppShell";
import { AddRecipeDialog } from "@/components/recipes/add-recipe-dialog";
import { isRecipeLayout, RecipeLayout } from "@/components/recipes/recipe-layout";
import { RecipeLayoutSwitcher } from "@/components/recipes/recipe-layout-switcher";
import { RecipeCtaCard } from "@/components/recipes/recipe-cta-card";
import { RecipesLayout } from "@/components/recipes/recipe-layouts";
import { Button } from "@/components/ui/button";
import type { Recipe } from "common";
import { useDebouncedValue, useRecipes, useRecipeSearch } from "@/hooks";

export const Route = createFileRoute("/recipes/")({
  head: () => ({
    meta: [
      { title: "Recipes - Mise" },
      {
        name: "description",
        content: "Your full recipe library, stored as Schema.org Recipe JSON-LD for portability.",
      },
      { property: "og:title", content: "Recipes - Mise" },
      {
        property: "og:description",
        content: "Your full recipe library, stored as Schema.org Recipe JSON-LD for portability.",
      },
    ],
  }),
  component: RecipesPage,
});

const categories = ["All", "Main Course", "Pasta", "Soup", "Bowl", "Breakfast", "Dessert"];

const EMPTY: Recipe[] = [];
const LAYOUT_STORAGE_KEY = "mise.recipeLayout";

function RecipesPage() {
  const recipes = useRecipes().data ?? EMPTY;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  const [layout, setLayout] = useState<RecipeLayout>(RecipeLayout.Grid);

  // Full-text search runs server-side (Meilisearch) and is paginated. With an
  // empty query we show the whole library and the category chips filter it
  // client-side; while searching, the category is applied server-side so it
  // composes with pagination.
  const debouncedQ = useDebouncedValue(q);
  const searching = debouncedQ.trim().length > 0;
  const search = useRecipeSearch(debouncedQ, cat);
  const searchHits = useMemo(
    () => search.data?.pages.flatMap((page) => page.hits) ?? EMPTY,
    [search.data],
  );
  const searchTotal = search.data?.pages[0]?.total ?? 0;

  useEffect(() => {
    const savedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (isRecipeLayout(savedLayout)) {
      setLayout(savedLayout);
    }
  }, []);

  const selectLayout = (nextLayout: RecipeLayout) => {
    setLayout(nextLayout);
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, nextLayout);
  };

  const filtered = useMemo(
    () =>
      searching
        ? searchHits
        : recipes.filter(
            (r) => cat === "All" || r.recipeCategory.toLowerCase() === cat.toLowerCase(),
          ),
    [searching, searchHits, recipes, cat],
  );

  // Cold start: the household has no recipes at all (not just filtered out).
  const isEmptyLibrary = !searching && recipes.length === 0;

  const addRecipeCta = {
    title: "Add a new recipe?",
    description: "Create your own or import from our public library",
    actionLabel: "Add recipe",
    icon: Plus,
    onClick: () => setNewRecipeOpen(true),
  };

  return (
    <AppShell
      title="Recipe library"
      // subtitle={`${recipes.length} recipes`}
      compactHeaderOnMobile
      actions={
        <>
          <RecipeLayoutSwitcher
            layout={layout}
            onLayoutChange={selectLayout}
            className="hidden p-0.5 sm:flex lg:p-1"
            buttonClassName="size-8 lg:size-9"
          />
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder="Search recipes, tags…"
            inputClassName="sm:w-36 lg:w-64"
          />
          <PrimaryButton onClick={() => setNewRecipeOpen(true)}>New recipe</PrimaryButton>
        </>
      }
    >
      <AddRecipeDialog open={newRecipeOpen} onOpenChange={setNewRecipeOpen} />

      <div
        className="sticky z-5 -mx-4 -mt-6 mb-4 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:-mt-8 sm:mb-5 sm:px-6 sm:py-2 md:-mx-10 md:px-10"
        style={{ top: "var(--app-header-height, 0px)" }}
      >
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
          {categories.map((c) => (
            <Button
              key={c}
              variant="ghost"
              onClick={() => setCat(c)}
              className={`h-7 shrink-0 rounded-full border px-3 text-xs font-medium sm:h-8 sm:px-3.5 ${
                cat === c
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground"
                  : "bg-card border-border text-foreground/70 hover:border-foreground/30 hover:bg-card hover:text-foreground/70"
              }`}
            >
              {c}
            </Button>
          ))}
        </div>

        <RecipeLayoutSwitcher
          layout={layout}
          onLayoutChange={selectLayout}
          className="p-0.5 sm:hidden"
          buttonClassName="size-8"
        />
      </div>

      {isEmptyLibrary ? (
        <div className="mx-auto max-w-md py-14 text-center">
          <h2 className="text-display text-2xl">Your recipe library is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your first recipe to get started.
          </p>
          <div className="mx-auto mt-6 max-w-xs">
            <RecipeCtaCard cta={addRecipeCta} layout={RecipeLayout.Grid} />
          </div>
        </div>
      ) : (
        <>
          <RecipesLayout
            recipes={filtered}
            layout={layout}
            cta={searching ? undefined : addRecipeCta}
          />

          {filtered.length === 0 && !(searching && search.isFetching) && (
            <div className="text-center py-20 text-muted-foreground">
              {searching
                ? `No recipes match "${debouncedQ.trim()}".`
                : "No recipes match those filters."}
            </div>
          )}

          {searching && search.hasNextPage && (
            <div className="flex justify-center py-8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => search.fetchNextPage()}
                disabled={search.isFetchingNextPage}
                className="h-10 rounded-full border border-border bg-card px-6 font-normal hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {search.isFetchingNextPage
                  ? "Loading…"
                  : `Load more (${searchTotal - filtered.length} more)`}
              </Button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

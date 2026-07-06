import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PrimaryButton, SearchBar } from "@/components/AppShell";
import { AddRecipeDialog } from "@/components/recipes/add-recipe-dialog";
import { isRecipeLayout, RecipeLayout } from "@/components/recipes/recipe-layout";
import { RecipeLayoutSwitcher } from "@/components/recipes/recipe-layout-switcher";
import { RecipesLayout } from "@/components/recipes/recipe-layouts";
import type { Recipe } from "common";
import { useDebouncedValue, useRecipes, useRecipeSearch } from "@/hooks";

export const Route = createFileRoute("/recipes/")({
  head: () => ({
    meta: [
      { title: "Recipes — Mise" },
      {
        name: "description",
        content: "Your full recipe library, stored as Schema.org Recipe JSON-LD for portability.",
      },
      { property: "og:title", content: "Recipes — Mise" },
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

  return (
    <AppShell
      title="Recipe library"
      subtitle={`${recipes.length} recipes · Schema.org Recipe format`}
      actions={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Search recipes, tags…" />
          <PrimaryButton onClick={() => setNewRecipeOpen(true)}>New recipe</PrimaryButton>
        </>
      }
    >
      <AddRecipeDialog open={newRecipeOpen} onOpenChange={setNewRecipeOpen} />

      <div
        className="sticky z-5 -mx-4 mb-6 flex flex-col gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10 xl:flex-row xl:items-center xl:justify-between"
        style={{ top: "var(--app-header-height, 0px)" }}
      >
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                cat === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground/70 hover:border-foreground/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <RecipeLayoutSwitcher layout={layout} onLayoutChange={selectLayout} />
      </div>

      <RecipesLayout recipes={filtered} layout={layout} />

      {filtered.length === 0 && !(searching && search.isFetching) && (
        <div className="text-center py-20 text-muted-foreground">
          {searching
            ? `No recipes match "${debouncedQ.trim()}".`
            : "No recipes match those filters."}
        </div>
      )}

      {searching && search.hasNextPage && (
        <div className="flex justify-center py-8">
          <button
            type="button"
            onClick={() => search.fetchNextPage()}
            disabled={search.isFetchingNextPage}
            className="h-10 px-6 rounded-full border border-border bg-card text-sm hover:bg-accent hover:text-accent-foreground transition disabled:opacity-50"
          >
            {search.isFetchingNextPage
              ? "Loading…"
              : `Load more (${searchTotal - filtered.length} more)`}
          </button>
        </div>
      )}
    </AppShell>
  );
}

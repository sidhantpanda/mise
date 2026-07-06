import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PrimaryButton, SearchBar } from "@/components/AppShell";
import { AddRecipeDialog } from "@/components/recipes/add-recipe-dialog";
import { isRecipeLayout, RecipeLayout } from "@/components/recipes/recipe-layout";
import { RecipeLayoutSwitcher } from "@/components/recipes/recipe-layout-switcher";
import { RecipesLayout } from "@/components/recipes/recipe-layouts";
import type { Recipe } from "common";
import { useRecipes } from "@/hooks";

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
      recipes.filter((r) => {
        const matchQ =
          !q ||
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          r.keywords.some((k) => k.includes(q.toLowerCase()));
        const matchC = cat === "All" || r.recipeCategory.toLowerCase() === cat.toLowerCase();
        return matchQ && matchC;
      }),
    [q, cat, recipes],
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

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No recipes match those filters.
        </div>
      )}
    </AppShell>
  );
}

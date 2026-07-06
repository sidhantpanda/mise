import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppShell, SearchBar } from "@/components/AppShell";
import { PublicRecipesLayout } from "@/components/recipes/public-recipe-layouts";
import { isRecipeLayout, RecipeLayout } from "@/components/recipes/recipe-layout";
import { RecipeLayoutSwitcher } from "@/components/recipes/recipe-layout-switcher";
import { usePublicLibrary } from "@/hooks";

export const Route = createFileRoute("/recipes/library")({
  head: () => ({
    meta: [
      { title: "Public library — Mise" },
      {
        name: "description",
        content: "Browse the public recipe library and import recipes into your household.",
      },
      { property: "og:title", content: "Public library — Mise" },
      {
        property: "og:description",
        content: "Browse the public recipe library and import recipes into your household.",
      },
    ],
  }),
  component: PublicLibraryPage,
});

const ALL = "All";
const LAYOUT_STORAGE_KEY = "mise.publicLibraryLayout";

function PublicLibraryPage() {
  const library = usePublicLibrary();
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState(ALL);
  const [layout, setLayout] = useState<RecipeLayout>(RecipeLayout.Grid);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (isRecipeLayout(saved)) setLayout(saved);
  }, []);

  const selectLayout = (next: RecipeLayout) => {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
  };

  const markImported = useCallback((id: string) => {
    setImportedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const recipes = useMemo(() => library.data ?? [], [library.data]);

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) if (r.cuisine) set.add(r.cuisine);
    return [ALL, ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [recipes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipes.filter((r) => {
      if (cuisine !== ALL && r.cuisine !== cuisine) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle) ||
        r.cuisine.toLowerCase().includes(needle) ||
        r.mealType.toLowerCase().includes(needle)
      );
    });
  }, [recipes, q, cuisine]);

  const hasRecipes = recipes.length > 0;

  return (
    <AppShell
      title="Public library"
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
            placeholder="Search public recipes…"
            inputClassName="sm:w-36 lg:w-64"
          />
          <Link
            to="/recipes"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
          >
            <ArrowLeft className="size-4" /> Library
          </Link>
        </>
      }
    >
      {hasRecipes && (
        <div
          className="sticky z-5 -mx-4 -mt-6 mb-4 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:-mt-8 sm:mb-5 sm:px-6 sm:py-2 md:-mx-10 md:px-10"
          style={{ top: "var(--app-header-height, 0px)" }}
        >
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
            {cuisines.map((c) => (
              <button
                key={c}
                onClick={() => setCuisine(c)}
                className={`h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition sm:h-8 sm:px-3.5 ${
                  cuisine === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground/70 hover:border-foreground/30"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <RecipeLayoutSwitcher
            layout={layout}
            onLayoutChange={selectLayout}
            className="p-0.5 sm:hidden"
            buttonClassName="size-8"
          />
        </div>
      )}

      {library.isLoading ? (
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : library.isError ? (
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="text-foreground">The public library could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {library.error instanceof Error ? library.error.message : "Please try again shortly."}
          </p>
          <button
            type="button"
            onClick={() => library.refetch()}
            className="mt-5 h-9 rounded-full border border-border bg-card px-5 text-sm hover:bg-accent hover:text-accent-foreground transition"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          {recipes.length === 0
            ? "The public library is empty right now."
            : "No public recipes match those filters."}
        </div>
      ) : (
        <PublicRecipesLayout
          recipes={filtered}
          layout={layout}
          importedIds={importedIds}
          onImported={markImported}
        />
      )}
    </AppShell>
  );
}

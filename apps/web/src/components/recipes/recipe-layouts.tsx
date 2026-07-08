import { Link } from "@tanstack/react-router";
import { RecipeGridCard, RecipeEyebrow, RecipeStats } from "@/components/recipes/recipe-card";
import { RecipeLayout } from "@/components/recipes/recipe-layout";
import { RecipeCtaCard, type RecipeCta } from "@/components/recipes/recipe-cta-card";
import { RecipeTable } from "@/components/recipes/recipe-table";
import { recipeDisplayImage } from "@/lib/recipe-image";
import type { Recipe } from "common";

export function RecipesLayout({
  recipes,
  layout,
  cta,
}: {
  recipes: Recipe[];
  layout: RecipeLayout;
  cta?: RecipeCta;
}) {
  if (recipes.length === 0) return null;

  if (layout === RecipeLayout.Compact) return <CompactGrid recipes={recipes} cta={cta} />;
  if (layout === RecipeLayout.List) return <RecipeList recipes={recipes} cta={cta} />;
  if (layout === RecipeLayout.Table) return <RecipeTable recipes={recipes} cta={cta} />;
  return <RecipeGrid recipes={recipes} cta={cta} />;
}

function RecipeGrid({ recipes, cta }: { recipes: Recipe[]; cta?: RecipeCta }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeGridCard key={recipe.identifier} recipe={recipe} />
      ))}
      {cta && <RecipeCtaCard cta={cta} layout={RecipeLayout.Grid} />}
    </div>
  );
}

function CompactGrid({ recipes, cta }: { recipes: Recipe[]; cta?: RecipeCta }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {recipes.map((recipe) => (
        <Link
          key={recipe.identifier}
          to="/recipes/$id"
          params={{ id: recipe.identifier }}
          className="group flex min-h-24 overflow-hidden rounded-lg border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="h-24 w-24 shrink-0 overflow-hidden">
            <img
              src={recipeDisplayImage(recipe)}
              alt={recipe.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <div className="min-w-0 p-3">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="truncate">{recipe.recipeCuisine}</span>
              <span>·</span>
              <span className="truncate">{recipe.recipeCategory}</span>
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{recipe.name}</h3>
            <RecipeStats recipe={recipe} className="mt-2 gap-x-3 text-[11px]" compact />
          </div>
        </Link>
      ))}
      {cta && <RecipeCtaCard cta={cta} layout={RecipeLayout.Compact} />}
    </div>
  );
}

function RecipeList({ recipes, cta }: { recipes: Recipe[]; cta?: RecipeCta }) {
  return (
    <div className="space-y-3">
      {recipes.map((recipe) => (
        <Link
          key={recipe.identifier}
          to="/recipes/$id"
          params={{ id: recipe.identifier }}
          className="group grid gap-4 rounded-xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="aspect-4/3 overflow-hidden rounded-lg sm:h-24 sm:aspect-auto">
            <img
              src={recipeDisplayImage(recipe)}
              alt={recipe.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <div className="min-w-0">
            <RecipeEyebrow recipe={recipe} />
            <h3 className="mt-1 text-display text-xl leading-tight">{recipe.name}</h3>
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {recipe.description}
            </p>
          </div>
          <RecipeStats recipe={recipe} className="justify-start gap-x-4 sm:w-56 sm:justify-end" />
        </Link>
      ))}
      {cta && <RecipeCtaCard cta={cta} layout={RecipeLayout.List} />}
    </div>
  );
}

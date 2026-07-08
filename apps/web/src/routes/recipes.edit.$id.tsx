import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RecipeForm } from "@/components/recipe-form";
import { useRecipes } from "@/hooks";
import type { Recipe } from "common";

export const Route = createFileRoute("/recipes/edit/$id")({
  head: () => ({
    meta: [
      { title: "Edit Recipe - Mise" },
      { name: "description", content: "Edit recipe details." },
    ],
  }),
  component: EditRecipePage,
});

function EditRecipePage() {
  const { id } = Route.useParams();
  const recipesQuery = useRecipes();
  const recipe = recipesQuery.data?.find((r) => r.identifier === id);
  const navigate = useNavigate();

  const onSaved = (saved: Recipe) => {
    navigate({ to: "/recipes/$id", params: { id: saved.identifier } });
  };

  if (!recipe) {
    return (
      <AppShell title={recipesQuery.isLoading ? "Loading…" : "Recipe not found"}>
        {recipesQuery.isLoading ? (
          <div className="py-20 text-center text-muted-foreground">Loading recipe…</div>
        ) : (
          <Link to="/recipes" className="text-sm underline">
            Back to recipes
          </Link>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Edit ${recipe.name}`}
      subtitle={`${recipe.recipeCuisine} · ${recipe.recipeCategory}`}
      actions={
        <Link
          to="/recipes/$id"
          params={{ id: recipe.identifier }}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
        >
          <ArrowLeft className="size-4" /> Recipe
        </Link>
      }
    >
      <RecipeForm
        recipe={recipe}
        onSaved={onSaved}
        onCancel={() => navigate({ to: "/recipes/$id", params: { id: recipe.identifier } })}
      />
    </AppShell>
  );
}

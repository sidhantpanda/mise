import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RecipeForm } from "@/components/recipe-form";
import type { Recipe } from "@/lib/mock-data";

export const Route = createFileRoute("/recipes/new")({
  head: () => ({
    meta: [
      { title: "New Recipe — Mise" },
      { name: "description", content: "Create a new Schema.org-native recipe." },
      { property: "og:title", content: "New Recipe — Mise" },
      { property: "og:description", content: "Create a new Schema.org-native recipe." },
    ],
  }),
  component: NewRecipePage,
});

function NewRecipePage() {
  const navigate = useNavigate();

  const onSaved = (recipe: Recipe) => {
    navigate({ to: "/recipes/$id", params: { id: recipe.identifier } });
  };

  return (
    <AppShell
      title="New recipe"
      subtitle="Import JSON-LD or build a recipe from scratch"
      actions={
        <Link
          to="/recipes"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
        >
          <ArrowLeft className="size-4" /> Library
        </Link>
      }
    >
      <RecipeForm onSaved={onSaved} onCancel={() => navigate({ to: "/recipes" })} />
    </AppShell>
  );
}

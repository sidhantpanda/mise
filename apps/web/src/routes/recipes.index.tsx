import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PrimaryButton, SearchBar } from "@/components/AppShell";
import { formatDuration, type Recipe } from "@/lib/mock-data";
import { useRecipes } from "@/hooks";
import { Clock, Star, Users } from "lucide-react";

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

function RecipesPage() {
  const recipes = useRecipes().data ?? EMPTY;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

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
          <PrimaryButton onClick={() => navigate({ to: "/recipes/new" })}>New recipe</PrimaryButton>
        </>
      }
    >
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((r) => (
          <Link
            key={r.identifier}
            to="/recipes/$id"
            params={{ id: r.identifier }}
            className="group rounded-2xl overflow-hidden bg-card border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={r.image[0]}
                alt={r.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>{r.recipeCuisine}</span>
                <span>·</span>
                <span>{r.recipeCategory}</span>
              </div>
              <h3 className="text-display text-xl mt-2 leading-tight">{r.name}</h3>
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{r.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {formatDuration(r.totalTime)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {r.recipeYield}
                </span>
                {r.aggregateRating && (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <Star className="size-3.5 fill-accent text-accent" />{" "}
                    {r.aggregateRating.ratingValue}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No recipes match those filters.
        </div>
      )}
    </AppShell>
  );
}

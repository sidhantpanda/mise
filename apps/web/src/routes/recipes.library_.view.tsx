import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, ChefHat, Clock, Download, Loader2, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { RecipeMethod } from "@/components/recipes/recipe-method";
import { publicRecipeLocation, publicRecipeQueryOptions, usePublicRecipe } from "@/hooks";
import { useImportPublicRecipe } from "@/hooks/mutations";
import { formatDuration } from "common";
import { serverApi } from "@/lib/api";
import { recipeMetaTags } from "@/lib/recipe-meta";

export const Route = createFileRoute("/recipes/library_/view")({
  validateSearch: (search: Record<string, unknown>): { id: string } => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  // Best-effort: primes the title (and warms the cache) for SSR. `/public-library`
  // still requires a session (requireAuth + requireHousehold), so this needs the
  // visitor's cookie forwarded just like the private recipe route.
  loader: async ({ context, deps }) => {
    if (!deps.id) return undefined;
    try {
      const client = context.request ? serverApi(context.request) : undefined;
      return await context.queryClient.ensureQueryData(
        publicRecipeQueryOptions(publicRecipeLocation(deps.id), client),
      );
    } catch {
      return undefined;
    }
  },
  head: ({ loaderData }) => ({
    meta: recipeMetaTags(loaderData, {
      title: "Public recipe - Mise",
      description: "Preview a public library recipe before importing it.",
    }),
  }),
  component: PublicRecipePreviewPage,
});

function PublicRecipePreviewPage() {
  const { id } = Route.useSearch();
  const location = id ? publicRecipeLocation(id) : "";
  const navigate = useNavigate();
  const query = usePublicRecipe(location);
  const importRecipe = useImportPublicRecipe();
  const [imported, setImported] = useState(false);
  const r = query.data;

  const onImport = async () => {
    if (!location) return;
    try {
      const { recipe } = await importRecipe.mutateAsync(location);
      setImported(true);
      toast.success(`Imported "${recipe.name}"`, {
        action: {
          label: "Open",
          onClick: () => navigate({ to: "/recipes/$id", params: { id: recipe.identifier } }),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const importButton = (
    <Button
      type="button"
      onClick={onImport}
      disabled={!r || importRecipe.isPending || imported}
      className="h-9 shrink-0 gap-1.5 rounded-full px-4 whitespace-nowrap shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
    >
      {imported ? (
        <>
          <Check className="size-4" /> Imported
        </>
      ) : importRecipe.isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Importing
        </>
      ) : (
        <>
          <Download className="size-4" /> Import to my library
        </>
      )}
    </Button>
  );

  return (
    <AppShell
      title={r?.name ?? (query.isLoading ? "Loading…" : "Public recipe")}
      subtitle={r ? [r.recipeCuisine, r.recipeCategory].filter(Boolean).join(" · ") : undefined}
      actions={
        <>
          {importButton}
          <Link
            to="/recipes/library"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
          >
            <ArrowLeft className="size-4" /> Library
          </Link>
        </>
      }
    >
      {query.isLoading ? (
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : query.isError || !r ? (
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="text-foreground">This recipe could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.error instanceof Error ? query.error.message : "Please try again shortly."}
          </p>
          <Link
            to="/recipes/library"
            className="mt-5 inline-flex h-9 items-center rounded-full border border-border bg-card px-5 text-sm hover:bg-accent hover:text-accent-foreground transition"
          >
            Back to library
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <img src={r.image[0]} alt={r.name} className="aspect-16/10 w-full object-cover" />
            </div>

            <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {r.description}
            </p>

            <div className="mt-6 grid grid-cols-4 gap-2 border-y border-border py-5 sm:grid-cols-5 sm:gap-6">
              <Meta
                icon={<Clock className="size-4" />}
                label="Prep"
                value={formatDuration(r.prepTime)}
              />
              <Meta
                icon={<ChefHat className="size-4" />}
                label="Cook"
                value={formatDuration(r.cookTime)}
              />
              <Meta
                icon={<Clock className="size-4" />}
                label="Total"
                value={formatDuration(r.totalTime)}
              />
              <Meta
                icon={<Users className="size-4" />}
                label="Yield"
                value={r.recipeYield || "-"}
              />
              {r.aggregateRating && (
                <Meta
                  icon={<Star className="size-4 fill-accent text-accent" />}
                  label="Rating"
                  value={`${r.aggregateRating.ratingValue} (${r.aggregateRating.ratingCount})`}
                />
              )}
            </div>
          </div>

          {/* Ordered ahead of Method here so it appears above it on mobile; the
              lg:row-span-2 keeps it spanning both rows of the left column on desktop. */}
          <aside className="space-y-5 lg:col-span-2 lg:row-span-2">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 lg:sticky lg:top-28">
              <h2 className="text-display text-2xl">Ingredients</h2>
              <ul className="mt-4 space-y-2.5">
                {r.recipeIngredient.map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px]">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">{importButton}</div>
            </div>

            {r.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {r.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                  >
                    #{k}
                  </span>
                ))}
              </div>
            )}
          </aside>

          <section className="lg:col-span-3">
            <h2 className="mb-4 text-display text-2xl">Method</h2>
            <RecipeMethod instructions={r.recipeInstructions} />
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:text-left">
      <div className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-lg bg-secondary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-xs sm:text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

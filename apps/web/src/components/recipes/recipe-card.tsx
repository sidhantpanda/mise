import { Link } from "@tanstack/react-router";
import { Clock, Star, Users } from "lucide-react";
import { formatDuration, type Recipe } from "common";
import { cn } from "@/lib/utils";
import { recipeDisplayImage } from "@/lib/recipe-image";

export function RecipeGridCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to="/recipes/$id"
      params={{ id: recipe.identifier }}
      className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="aspect-[4/3] overflow-hidden">
        <img
          src={recipeDisplayImage(recipe)}
          alt={recipe.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-4 sm:p-5">
        <RecipeEyebrow recipe={recipe} />
        <h3 className="mt-2 text-display text-xl leading-tight">{recipe.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p>
        <RecipeStats recipe={recipe} className="mt-4 justify-between" />
      </div>
    </Link>
  );
}

export function RecipeEyebrow({ recipe }: { recipe: Recipe }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">
      <span>{recipe.recipeCuisine}</span>
      <span>·</span>
      <span>{recipe.recipeCategory}</span>
    </div>
  );
}

export function RecipeStats({
  recipe,
  className,
  compact = false,
}: {
  recipe: Recipe;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-y-1 text-xs text-muted-foreground", className)}
    >
      <span className="inline-flex items-center gap-1">
        <Clock className={compact ? "size-3" : "size-3.5"} /> {formatDuration(recipe.totalTime)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Users className={compact ? "size-3" : "size-3.5"} /> {recipe.recipeYield}
      </span>
      {recipe.aggregateRating && (
        <span className="inline-flex items-center gap-1 text-foreground">
          <Star className={cn("fill-accent text-accent", compact ? "size-3" : "size-3.5")} />{" "}
          {recipe.aggregateRating.ratingValue}
        </span>
      )}
    </div>
  );
}

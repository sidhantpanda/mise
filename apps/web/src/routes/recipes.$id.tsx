import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RecipeMethod } from "@/components/recipes/recipe-method";
import { formatDuration, type Recipe } from "common";
import { useMe, useRecipes, recipesQueryOptions } from "@/hooks";
import { useDeleteRecipe, useAddFromRecipe } from "@/hooks/mutations";
import { serverApi } from "@/lib/api";
import { recipeMetaTags } from "@/lib/recipe-meta";
import {
  Clock,
  ChefHat,
  Users,
  Star,
  ArrowLeft,
  CalendarPlus,
  ShoppingBasket,
  Code2,
  Pencil,
  Trash2,
  Download,
  Minus,
  Plus,
  RotateCcw,
  Copy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PlanMealDialog } from "@/components/plan-meal-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/recipes/$id")({
  // Best-effort: primes the title (and warms the recipes cache) for SSR. If it
  // fails — e.g. no session cookie to forward — the page still works, since
  // `useRecipes()` below fetches with the browser's real cookies regardless.
  loader: async ({ context, params }) => {
    try {
      const client = context.request ? serverApi(context.request) : undefined;
      const recipes = await context.queryClient.ensureQueryData(recipesQueryOptions(client));
      return recipes.find((r) => r.identifier === params.id);
    } catch {
      return undefined;
    }
  },
  head: ({ loaderData }) => ({
    meta: recipeMetaTags(loaderData, { title: "Recipe — Mise", description: "Recipe details" }),
  }),
  component: RecipePage,
  notFoundComponent: () => (
    <div className="p-10 text-center">
      <h2 className="text-display text-2xl">Recipe not found</h2>
      <Link to="/recipes" className="text-sm underline mt-2 inline-block">
        Back to recipes
      </Link>
    </div>
  ),
});

function RecipePage() {
  const { id } = Route.useParams();
  const recipesQuery = useRecipes();
  const recipes = recipesQuery.data ?? [];
  const r = recipes.find((x) => x.identifier === id);
  const currentUserId = useMe().data?.user.id;
  const deleteRecipe = useDeleteRecipe();
  const addFromRecipe = useAddFromRecipe();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false);
  const [showJsonLd, setShowJsonLd] = useState(false);
  const baseYield = parseRecipeYield(r?.recipeYield);
  const [previewYield, setPreviewYield] = useState(baseYield.amount);

  useEffect(() => {
    setPreviewYield(baseYield.amount);
  }, [baseYield.amount, r?.identifier]);

  if (!r) {
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

  const onDelete = async () => {
    if (!confirm(`Delete "${r.name}"? This also removes it from your meal plan.`)) return;
    await deleteRecipe.mutateAsync(r.identifier);
    toast.success("Recipe deleted");
    navigate({ to: "/recipes" });
  };

  const onAddToShopping = async () => {
    const { added } = await addFromRecipe.mutateAsync(r.identifier);
    if (added === 0) toast("All ingredients already on your list");
    else toast.success(`Added ${added} ingredient${added === 1 ? "" : "s"} to shopping`);
  };

  const copyJsonLd = async () => {
    await navigator.clipboard.writeText(JSON.stringify(r, null, 2));
    toast.success("Recipe JSON-LD copied");
  };

  const exportJson = () => {
    downloadRecipeJson(r);
    toast.success("Recipe JSON downloaded");
  };

  const ingredientScale = previewYield / baseYield.amount;
  const scaledIngredients = r.recipeIngredient.map((ing) =>
    scaleIngredientLine(ing, ingredientScale),
  );
  const isAdjusted = Math.abs(previewYield - baseYield.amount) > 0.001;
  const adjustedYieldLabel = isAdjusted
    ? formatYieldLabel(previewYield, baseYield.unit)
    : baseYield.label;

  return (
    <AppShell
      title={r.name}
      subtitle={`${r.recipeCuisine} · ${r.recipeCategory} · by ${r.author.identifier && r.author.identifier === currentUserId ? "you" : r.author.name
        }`}
      actions={
        <>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
          >
            <Download className="size-4" /> Export
          </button>
          <Link
            to="/recipes/edit/$id"
            params={{ id: r.identifier }}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
          >
            <Pencil className="size-4" /> Edit
          </Link>
          <button
            onClick={onDelete}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-destructive hover:text-destructive-foreground transition"
            aria-label="Delete recipe"
          >
            <Trash2 className="size-4" />
          </button>
          <Link
            to="/recipes"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-input bg-card text-sm whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
          >
            <ArrowLeft className="size-4" /> All
          </Link>
        </>
      }
    >
      <div className="grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <div className="rounded-2xl overflow-hidden bg-card border border-border">
            <img src={r.image[0]} alt={r.name} className="w-full aspect-16/10 object-cover" />
          </div>

          <p className="text-base sm:text-lg text-muted-foreground mt-6 leading-relaxed">
            {r.description}
          </p>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6 mt-6 py-5 border-y border-border">
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
            <Meta icon={<Users className="size-4" />} label="Yield" value={adjustedYieldLabel} />
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
        <aside className="lg:col-span-2 lg:row-span-2 space-y-5">
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 lg:sticky lg:top-28">
            <div className="flex flex-col gap-4 mb-4 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
              <div>
                <h2 className="text-display text-2xl">Ingredients</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Previewing {adjustedYieldLabel}
                </p>
              </div>
              <div className="w-40 shrink-0">
                <div className="flex h-12 w-full items-center justify-between rounded-full border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewYield((v) => Math.max(1, v - 1))}
                    disabled={previewYield <= 1}
                    className="size-8 rounded-full grid place-items-center text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Decrease servings"
                  >
                    <Minus className="size-4" />
                  </button>
                  <div className="flex h-10 w-20 flex-col items-center justify-center px-2 text-center">
                    <div className="h-5 text-display text-xl leading-none tabular-nums">
                      {formatNumber(previewYield)}
                    </div>
                    <div className="h-3 text-[10px] uppercase tracking-wider leading-none text-muted-foreground">
                      {baseYield.unit}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewYield((v) => Math.min(99, v + 1))}
                    className="size-8 rounded-full grid place-items-center text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    aria-label="Increase servings"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewYield(baseYield.amount)}
                  disabled={!isAdjusted}
                  className="mt-2 h-4 w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:invisible"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
              </div>
            </div>
            <ul className="space-y-2.5">
              {scaledIngredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1.5 size-4 accent-primary" />
                  <span>{ing}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
              <button
                onClick={() => setPlanning(true)}
                className="h-10 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:opacity-90"
              >
                <CalendarPlus className="size-4" /> Add to plan
              </button>
              <button
                onClick={onAddToShopping}
                className="h-10 rounded-full bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:opacity-90"
              >
                <ShoppingBasket className="size-4" /> To shopping
              </button>
            </div>
          </div>

          {r.nutrition && (
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
              <h3 className="text-display text-xl mb-3">Nutrition</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {r.nutrition.calories && <Nut label="Calories" value={r.nutrition.calories} />}
                {r.nutrition.proteinContent && (
                  <Nut label="Protein" value={r.nutrition.proteinContent} />
                )}
                {r.nutrition.carbohydrateContent && (
                  <Nut label="Carbs" value={r.nutrition.carbohydrateContent} />
                )}
                {r.nutrition.fatContent && <Nut label="Fat" value={r.nutrition.fatContent} />}
              </dl>
            </div>
          )}

          {r.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.keywords.map((k) => (
                <span
                  key={k}
                  className="px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground"
                >
                  #{k}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowJsonLd((v) => !v)}
              className="text-xs inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Code2 className="size-3.5" /> {showJsonLd ? "Hide" : "View"} JSON-LD
            </button>
            <button
              type="button"
              onClick={copyJsonLd}
              className="text-xs inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" /> Copy JSON-LD
            </button>
          </div>
          {showJsonLd && (
            <pre className="text-[11px] bg-muted/60 border border-border rounded-xl p-4 overflow-auto max-h-96">
              {JSON.stringify(r, null, 2)}
            </pre>
          )}
        </aside>

        <section className="lg:col-span-3">
          <h2 className="text-display text-2xl mb-4">Method</h2>
          <RecipeMethod instructions={r.recipeInstructions} />
        </section>
      </div>

      <RelatedStrip currentId={r.identifier} recipes={recipes} />

      <PlanMealDialog open={planning} onOpenChange={setPlanning} />
    </AppShell>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="size-9 rounded-lg bg-secondary grid place-items-center">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function Nut({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg">{value}</dd>
    </div>
  );
}

function downloadRecipeJson(recipe: Recipe) {
  const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${recipeFileBase(recipe.name)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function recipeFileBase(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "recipe";
}

function parseRecipeYield(value?: string) {
  const fallback = { amount: 1, unit: "serving", label: "1 serving" };
  if (!value) return fallback;

  const trimmed = value.trim();
  const leadingRange = trimmed.match(
    /^(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*(.*)$/i,
  );
  if (leadingRange) {
    const amount = Math.max(1, Number.parseFloat(leadingRange[1]));
    return {
      amount: Number.isFinite(amount) ? amount : fallback.amount,
      unit: leadingRange[2].trim() || "servings",
      label: trimmed,
    };
  }

  const match = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;

  const amount = Math.max(1, Number.parseFloat(match[1]));
  const unit = trimmed.slice(match.index! + match[0].length).trim() || "servings";

  return {
    amount: Number.isFinite(amount) ? amount : fallback.amount,
    unit,
    label: trimmed,
  };
}

const unicodeFractions: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

function parseQuantity(value: string) {
  if (value in unicodeFractions) return unicodeFractions[value];

  const parts = value.trim().split(/\s+/);
  if (parts.length === 2 && parts[1].includes("/")) {
    return Number.parseFloat(parts[0]) + parseFraction(parts[1]);
  }

  if (value.includes("/")) return parseFraction(value);
  return Number.parseFloat(value);
}

function parseFraction(value: string) {
  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number.parseFloat(rawNumerator);
  const denominator = Number.parseFloat(rawDenominator);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return Number.NaN;
  }

  return numerator / denominator;
}

const quantityPattern =
  "(?:\\d+(?:\\.\\d+)?\\s+\\d+\\/\\d+)|(?:\\d+\\/\\d+)|(?:\\d+(?:\\.\\d+)?)|[¼½¾⅓⅔⅛⅜⅝⅞]";

const scalableUnits = [
  "bunch",
  "bunches",
  "can",
  "cans",
  "clove",
  "cloves",
  "cup",
  "cups",
  "egg",
  "eggs",
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "lb",
  "lbs",
  "lemon",
  "lemons",
  "liter",
  "liters",
  "litre",
  "litres",
  "ml",
  "ounce",
  "ounces",
  "packet",
  "packets",
  "pinch",
  "pinches",
  "portion",
  "portions",
  "pound",
  "pounds",
  "sheet",
  "sheets",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "stalk",
  "stalks",
  "stick",
  "sticks",
  "tablespoon",
  "tablespoons",
  "teaspoon",
  "teaspoons",
];

const scalableUnitPattern = scalableUnits.join("|");

function scaleIngredientLine(line: string, scale: number) {
  const quantityWithUnit = new RegExp(
    `(^|[^A-Za-z0-9/])(${quantityPattern})(?:\\s*(?:-|–|—|to)\\s*(?:${quantityPattern}))?(\\s+(?:${scalableUnitPattern})\\b)`,
    "gi",
  );

  const scaledUnits = line.replace(
    quantityWithUnit,
    (match, prefix: string, rawAmount: string, unit: string) => {
      const amount = parseQuantity(rawAmount);
      if (!Number.isFinite(amount)) return match;
      const scaledAmount = amount * scale;

      return `${prefix}${formatNumber(scaledAmount)}${adjustScaledUnit(unit, scaledAmount)}`;
    },
  );

  return scaleLeadingCountIngredient(scaledUnits, scale);
}

function scaleLeadingCountIngredient(line: string, scale: number) {
  const match = line.match(
    new RegExp(
      `^(\\s*)(${quantityPattern})(?:\\s*(?:-|–|—|to)\\s*(?:${quantityPattern}))?(\\s+.+)$`,
      "i",
    ),
  );
  if (!match) return line;

  const firstWord = match[3]
    .trim()
    .match(/^([A-Za-z]+)/)?.[1]
    ?.toLowerCase();
  if (firstWord && scalableUnits.includes(firstWord)) return line;

  const amount = parseQuantity(match[2]);
  if (!Number.isFinite(amount)) return line;
  const scaledAmount = amount * scale;

  return `${match[1]}${formatNumber(scaledAmount)}${adjustCountNoun(match[3], scaledAmount)}`;
}

function adjustCountNoun(rest: string, amount: number) {
  if (amount <= 1) return rest;

  const boundary = rest.search(/[,;]/);
  const phrase = boundary === -1 ? rest : rest.slice(0, boundary);
  const remainder = boundary === -1 ? "" : rest.slice(boundary);
  const match = phrase.match(/^(.*?)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return rest;

  return `${match[1]}${pluralizeWord(match[2])}${match[3]}${remainder}`;
}

function pluralizeWord(word: string) {
  const lower = word.toLowerCase();
  const known = pluralUnits[lower];
  if (known) return preserveCase(word, known);
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(lower)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/(tomato|potato)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function preserveCase(source: string, value: string) {
  if (source.toUpperCase() === source) return value.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return `${value[0].toUpperCase()}${value.slice(1)}`;
  return value;
}

function formatYieldLabel(amount: number, unit: string) {
  return `${formatNumber(amount)} ${formatUnit(unit, amount)}`;
}

function formatUnit(unit: string, amount: number) {
  if (amount === 1 && unit.endsWith("s")) return unit.slice(0, -1);
  return unit;
}

const pluralUnits: Record<string, string> = {
  bunch: "bunches",
  can: "cans",
  clove: "cloves",
  cup: "cups",
  egg: "eggs",
  gram: "grams",
  kilogram: "kilograms",
  lemon: "lemons",
  liter: "liters",
  litre: "litres",
  ounce: "ounces",
  packet: "packets",
  pinch: "pinches",
  portion: "portions",
  pound: "pounds",
  sheet: "sheets",
  slice: "slices",
  sprig: "sprigs",
  stalk: "stalks",
  stick: "sticks",
  tablespoon: "tablespoons",
  teaspoon: "teaspoons",
};

const singularUnits = Object.fromEntries(
  Object.entries(pluralUnits).map(([singular, plural]) => [plural, singular]),
);

function adjustScaledUnit(rest: string, amount: number) {
  const match = rest.match(/^(\s+)([A-Za-z]+)/);
  if (!match) return rest;

  const [, space, unit] = match;
  const normalized = unit.toLowerCase();
  const replacement =
    amount > 1
      ? pluralUnits[normalized]
      : Math.abs(amount - 1) < 0.001
        ? singularUnits[normalized]
        : undefined;

  if (!replacement) return rest;
  return `${space}${replacement}${rest.slice(match[0].length)}`;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const fractionText = formatCommonFraction(fraction);

  if (fractionText) return whole > 0 ? `${whole} ${fractionText}` : fractionText;
  if (Number.isInteger(rounded)) return rounded.toString();

  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function formatCommonFraction(value: number) {
  if (value < 0.03) return "";

  const candidates = [
    { value: 1 / 8, label: "1/8" },
    { value: 1 / 4, label: "1/4" },
    { value: 1 / 3, label: "1/3" },
    { value: 3 / 8, label: "3/8" },
    { value: 1 / 2, label: "1/2" },
    { value: 5 / 8, label: "5/8" },
    { value: 2 / 3, label: "2/3" },
    { value: 3 / 4, label: "3/4" },
    { value: 7 / 8, label: "7/8" },
  ];

  const closest = candidates.reduce((best, candidate) =>
    Math.abs(candidate.value - value) < Math.abs(best.value - value) ? candidate : best,
  );

  if (Math.abs(closest.value - value) <= 0.03) return closest.label;
  return "";
}

function RelatedStrip({ currentId, recipes }: { currentId: string; recipes: Recipe[] }) {
  const others = recipes.filter((r) => r.identifier !== currentId).slice(0, 3);
  if (others.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="text-display text-2xl mb-4">More from your library</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {others.map((r) => (
          <Link
            key={r.identifier}
            to="/recipes/$id"
            params={{ id: r.identifier }}
            className="group rounded-xl overflow-hidden bg-card border border-border hover:shadow-md transition"
          >
            <img
              src={r.image[0]}
              alt={r.name}
              className="w-full aspect-4/3 object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="p-4">
              <div className="text-display text-lg leading-tight">{r.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDuration(r.totalTime)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { formatDuration } from "@/lib/mock-data";
import { useMe, useMeals, useRecipes, usePantry, useShopping } from "@/hooks";
import { Clock, AlertTriangle, ArrowUpRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mise" },
      {
        name: "description",
        content: "Today's meals, low pantry items, and what to buy at a glance.",
      },
      { property: "og:title", content: "Dashboard — Mise" },
      {
        property: "og:description",
        content: "Today's meals, low pantry items, and what to buy at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const mealPlan = useMeals().data ?? [];
  const recipes = useRecipes().data ?? [];
  const pantry = usePantry().data ?? [];
  const shoppingList = useShopping().data ?? [];
  const firstName = (useMe().data?.user.name ?? "there").split(" ")[0];
  const getRecipe = (id: string) => recipes.find((r) => r.identifier === id);

  const todayISO = new Date().toISOString().slice(0, 10);
  const todays = mealPlan.filter((m) => m.date === todayISO);
  const upcoming = mealPlan.filter((m) => m.date > todayISO).slice(0, 4);
  const expiring = pantry
    .filter((p) => p.expires)
    .sort((a, b) => (a.expires! < b.expires! ? -1 : 1))
    .slice(0, 4);
  const toBuy = shoppingList.filter((s) => !s.checked).length;

  return (
    <AppShell
      title={`Good ${greeting()}, ${firstName}`}
      subtitle={`Here's what's on the pass for ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
    >
      {/* hero stats */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Today's meals" value={todays.length.toString()} hint="planned" />
        <StatCard label="Recipes" value={recipes.length.toString()} hint="in library" />
        <StatCard label="Shopping" value={toBuy.toString()} hint="items to buy" accent />
        <StatCard label="Pantry" value={pantry.length.toString()} hint="items tracked" />
      </div>

      <div className="grid min-w-0 lg:grid-cols-3 gap-6">
        {/* Today */}
        <section className="min-w-0 lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
            <h2 className="text-display text-2xl">On the menu today</h2>
            <Link
              to="/meal-plan"
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Full week <ArrowUpRight className="size-3" />
            </Link>
          </div>

          {todays.length === 0 ? (
            <EmptyHint text="Nothing planned. Drop a recipe onto today in the meal plan." />
          ) : (
            <ul className="divide-y divide-border">
              {todays.map((m) => {
                const r = getRecipe(m.recipeId);
                if (!r) return null;
                return (
                  <li
                    key={m.identifier}
                    className="py-4 first:pt-0 last:pb-0 flex gap-3 sm:gap-4 items-center"
                  >
                    <img
                      src={r.image[0]}
                      alt={r.name}
                      className="size-14 sm:size-16 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-accent">
                        {m.mealType}
                      </div>
                      <Link
                        to="/recipes/$id"
                        params={{ id: r.identifier }}
                        className="block text-display text-lg leading-tight hover:underline truncate"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {formatDuration(r.totalTime)}
                        </span>
                        <span>{m.servings} servings</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Expiring */}
        <section className="min-w-0 bg-card border border-border rounded-2xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="size-4 text-accent" />
            <h2 className="text-display text-2xl">Use it up</h2>
          </div>
          <ul className="space-y-3">
            {expiring.map((p) => (
              <li key={p.identifier} className="flex items-center justify-between text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{daysUntil(p.expires!)}d left</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Upcoming */}
        <section className="min-w-0 lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-6">
          <h2 className="text-display text-2xl mb-5">Coming up this week</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {upcoming.map((m) => {
              const r = getRecipe(m.recipeId);
              if (!r) return null;
              return (
                <Link
                  key={m.identifier}
                  to="/recipes/$id"
                  params={{ id: r.identifier }}
                  className="group flex min-w-0 gap-3 p-3 rounded-xl hover:bg-secondary/60 transition"
                >
                  <img src={r.image[0]} alt={r.name} className="size-14 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {new Date(m.date).toLocaleDateString(undefined, { weekday: "short" })} ·{" "}
                      {m.mealType}
                    </div>
                    <div className="font-display text-base leading-tight truncate group-hover:underline">
                      {r.name}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Tip */}
        <section className="min-w-0 bg-primary text-primary-foreground rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <Sparkles className="size-5" />
          <div>
            <h3 className="text-display text-2xl leading-tight mt-6">Schema.org native</h3>
            <p className="text-sm text-primary-foreground/80 mt-2">
              Every recipe is stored in standard JSON-LD, so importing from NYT Cooking, AllRecipes,
              or any compliant site is a copy-paste away.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 border ${accent ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border"}`}
    >
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-display text-3xl sm:text-4xl mt-2 leading-none">{value}</div>
      <div className="text-xs mt-1 opacity-70">{hint}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

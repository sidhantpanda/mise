import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PrimaryButton } from "@/components/AppShell";
import { type PlannedMeal } from "common";
import { useMe, useMeals, useRecipes } from "@/hooks";
import { PlanMealDialog } from "@/components/plan-meal-dialog";
import { WriteGuard } from "@/components/write-guard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/meal-plan")({
  head: () => ({
    meta: [
      { title: "Meal Plan - Mise" },
      { name: "description", content: "Your week, planned. Add recipes to any day or meal slot." },
      { property: "og:title", content: "Meal Plan - Mise" },
      {
        property: "og:description",
        content: "Plan the week's meals across breakfast, lunch, and dinner.",
      },
    ],
  }),
  component: MealPlanPage,
});

const mealTypes: Array<"Breakfast" | "Lunch" | "Dinner"> = ["Breakfast", "Lunch", "Dinner"];

function MealPlanPage() {
  const mealPlan = useMeals().data ?? [];
  const recipes = useRecipes().data ?? [];
  const members = useMe().data?.household?.members ?? [];
  const [editing, setEditing] = useState<PlannedMeal | undefined>();
  const [creating, setCreating] = useState<{
    date?: string;
    mealType?: (typeof mealTypes)[number];
  } | null>(null);

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const getRecipe = (id: string) => recipes.find((r) => r.identifier === id);

  return (
    <AppShell
      title="Weekly meal plan"
      subtitle={`${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
      actions={<PrimaryButton onClick={() => setCreating({})}>Plan a meal</PrimaryButton>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
        {days.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const isToday = iso === today.toISOString().slice(0, 10);
          return (
            <div
              key={iso}
              className={`rounded-2xl border ${isToday ? "border-primary" : "border-border"} bg-card overflow-hidden flex flex-col`}
            >
              <div
                className={`px-4 py-3 ${isToday ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}
              >
                <div className="text-[11px] uppercase tracking-wider opacity-80">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className="text-display text-2xl leading-none mt-0.5">{d.getDate()}</div>
              </div>
              <div className="p-3 space-y-2 flex-1 min-h-45 sm:min-h-60 2xl:min-h-70">
                {mealTypes.map((mt) => {
                  const meals = mealPlan.filter((m) => m.date === iso && m.mealType === mt);
                  return (
                    <div key={mt}>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                        {mt}
                      </div>
                      {meals.map((m) => {
                        const r = getRecipe(m.recipeId);
                        if (!r) return null;
                        const assignee = members.find((u) => u.id === m.assignee);
                        return (
                          <div
                            key={m.identifier}
                            className="bg-secondary/60 hover:bg-secondary rounded-lg p-2.5 transition mb-1.5"
                          >
                            <div className="flex gap-2 min-w-0">
                              <Link
                                to="/recipes/$id"
                                params={{ id: r.identifier }}
                                className="shrink-0"
                              >
                                <img
                                  src={r.image[0]}
                                  alt=""
                                  className="size-10 rounded object-cover"
                                />
                              </Link>
                              <div className="min-w-0 flex-1">
                                <WriteGuard className="w-full" side="top">
                                  <Button
                                    variant="ghost"
                                    onClick={() => setEditing(m)}
                                    className="block h-auto w-full justify-start truncate p-0 text-left text-xs font-medium leading-tight hover:bg-transparent hover:underline"
                                  >
                                    {r.name}
                                  </Button>
                                </WriteGuard>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {m.servings} serv
                                </div>
                              </div>
                            </div>
                            {assignee && (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <span
                                  className="size-4 rounded-full text-white grid place-items-center text-[8px] font-bold"
                                  style={{ backgroundColor: assignee.avatarColor }}
                                >
                                  {assignee.name[0]}
                                </span>
                                {assignee.name.split(" ")[0]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <WriteGuard className="w-full" side="top">
                        <Button
                          variant="ghost"
                          onClick={() => setCreating({ date: iso, mealType: mt })}
                          className="h-10 w-full rounded-lg border border-dashed border-border text-xs font-normal text-muted-foreground hover:border-foreground/30 hover:bg-transparent hover:text-foreground"
                        >
                          + Add
                        </Button>
                      </WriteGuard>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <PlanMealDialog
        open={creating !== null}
        onOpenChange={(v) => !v && setCreating(null)}
        defaultDate={creating?.date}
        defaultMealType={creating?.mealType}
      />
      <PlanMealDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(undefined)}
        meal={editing}
      />
    </AppShell>
  );
}

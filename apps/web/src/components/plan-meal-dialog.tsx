import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PlannedMeal } from "common";
import { useDebouncedValue, useMe, useRecipes, useRecipeSearch } from "@/hooks";
import { useCreateMeal, useUpdateMeal, useDeleteMeal } from "@/hooks/mutations";
import { toast } from "sonner";
import { Search } from "lucide-react";

const mealTypes = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

export function PlanMealDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultMealType,
  meal,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  defaultMealType?: (typeof mealTypes)[number];
  meal?: PlannedMeal;
}) {
  const recipes = useRecipes().data ?? [];
  const members = useMe().data?.household?.members ?? [];
  const createMeal = useCreateMeal();
  const updateMeal = useUpdateMeal();
  const deleteMeal = useDeleteMeal();
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [mealType, setMealType] = useState<(typeof mealTypes)[number]>(defaultMealType || "Dinner");
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);
  const [servings, setServings] = useState(2);
  const [assignee, setAssignee] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    if (meal) {
      setDate(meal.date);
      setMealType(meal.mealType);
      setRecipeId(meal.recipeId);
      setServings(meal.servings);
      setAssignee(meal.assignee);
    } else {
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setMealType(defaultMealType || "Dinner");
      setRecipeId(undefined);
      setServings(2);
      setAssignee(undefined);
    }
    setQ("");
  }, [open, meal, defaultDate, defaultMealType]);

  // Search the library server-side (Meilisearch) while typing; show everything
  // when the box is empty.
  const debouncedQ = useDebouncedValue(q);
  const search = useRecipeSearch(debouncedQ);
  const searchHits = search.data?.pages.flatMap((page) => page.hits) ?? [];
  const searching = debouncedQ.trim().length > 0;
  const filtered = searching ? searchHits : recipes;

  const submit = async () => {
    if (!recipeId) {
      toast.error("Pick a recipe");
      return;
    }
    try {
      if (meal) {
        await updateMeal.mutateAsync({
          id: meal.identifier,
          patch: { date, mealType, recipeId, servings, assignee },
        });
        toast.success("Meal updated");
      } else {
        await createMeal.mutateAsync({ date, mealType, recipeId, servings, assignee });
        toast.success("Added to meal plan");
      }
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save the meal. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-display text-2xl sm:text-3xl font-normal">
            {meal ? "Edit meal" : "Plan a meal"}
          </DialogTitle>
          <DialogDescription>Schedule a recipe for a day and cook.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Date
              </Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Meal
              </Label>
              <div className="grid grid-cols-2 gap-1 min-[420px]:grid-cols-4 sm:grid-cols-2 xl:grid-cols-4">
                {mealTypes.map((mt) => (
                  <button
                    key={mt}
                    onClick={() => setMealType(mt)}
                    type="button"
                    className={`h-9 rounded-md px-2 text-xs font-medium transition ${
                      mealType === mt
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary hover:bg-secondary/70"
                    }`}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Recipe
            </Label>
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your library…"
                className="pl-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  No recipes match.
                </div>
              )}
              {filtered.map((r) => (
                <button
                  key={r.identifier}
                  type="button"
                  onClick={() => setRecipeId(r.identifier)}
                  className={`w-full text-left flex items-center gap-3 p-2.5 hover:bg-secondary/60 transition ${
                    recipeId === r.identifier ? "bg-primary/10" : ""
                  }`}
                >
                  <img src={r.image[0]} alt="" className="size-10 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.recipeCuisine} · {r.recipeCategory}
                    </div>
                  </div>
                  {recipeId === r.identifier && (
                    <span className="text-xs text-primary font-medium">Selected</span>
                  )}
                </button>
              ))}
              {searching && search.hasNextPage && (
                <button
                  type="button"
                  onClick={() => search.fetchNextPage()}
                  disabled={search.isFetchingNextPage}
                  className="w-full p-2.5 text-center text-xs font-medium text-primary hover:bg-secondary/60 transition disabled:opacity-50"
                >
                  {search.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Servings
              </Label>
              <Input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Cook
              </Label>
              <select
                value={assignee || ""}
                onChange={(e) => setAssignee(e.target.value || undefined)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {meal && (
            <button
              type="button"
              onClick={async () => {
                await deleteMeal.mutateAsync(meal.identifier);
                toast.success("Meal removed");
                onOpenChange(false);
              }}
              className="h-10 px-5 mr-auto rounded-full text-sm text-destructive hover:bg-destructive/10 transition"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 px-5 rounded-full border border-border bg-card text-sm hover:bg-accent hover:text-accent-foreground transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            {meal ? "Save" : "Add meal"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

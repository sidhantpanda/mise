import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Sparkles } from "lucide-react";
import type { Recipe, RecipeInstruction } from "@/lib/mock-data";
import { useCreateRecipe, useUpdateRecipe } from "@/hooks/mutations";
import { toast } from "sonner";

const blank = () => ({
  name: "",
  description: "",
  image: "",
  prepTime: "15",
  cookTime: "30",
  yield: "4 servings",
  category: "Main Course",
  cuisine: "",
  keywords: "",
  ingredients: [""],
  instructions: [""],
  structuredInstructions: null as RecipeInstruction[] | null,
  schemaJson: null as Record<string, unknown> | null,
});

type RecipeFormState = ReturnType<typeof blank>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
};

const isRecipeNode = (value: unknown) => {
  if (!isRecord(value)) return false;
  const type = value["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
};

const optionalName = (value: Record<string, unknown>) =>
  typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined;

const isHowToSection = (
  instruction: RecipeInstruction,
): instruction is Extract<RecipeInstruction, { "@type": "HowToSection" }> =>
  instruction["@type"] === "HowToSection";

const normalizeInstructionSteps = (
  value: unknown,
): Extract<RecipeInstruction, { "@type": "HowToStep" }>[] =>
  normalizeInstructions(value).flatMap((instruction) =>
    isHowToSection(instruction) ? instruction.itemListElement : [instruction],
  );

const normalizeInstructions = (value: unknown): RecipeInstruction[] => {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ "@type": "HowToStep", text }] : [];
  }

  if (Array.isArray(value)) return value.flatMap(normalizeInstructions);
  if (!isRecord(value)) return [];

  const directText = asString(value.text).trim();
  if (directText) {
    const name = optionalName(value);
    return [{ "@type": "HowToStep", ...(name ? { name } : {}), text: directText }];
  }

  const steps = normalizeInstructionSteps(value.itemListElement);
  if (steps.length === 0) return [];

  const name = optionalName(value);
  if (value["@type"] === "HowToSection" || name) {
    return [{ "@type": "HowToSection", ...(name ? { name } : {}), itemListElement: steps }];
  }

  return steps;
};

const instructionTexts = (instructions: RecipeInstruction[]) => {
  return instructions.flatMap((instruction) =>
    isHowToSection(instruction)
      ? instruction.itemListElement.map((step) => step.text)
      : [instruction.text],
  );
};

const minutesToISO = (m: string) => {
  const n = parseInt(m || "0", 10) || 0;
  if (n <= 0) return "PT0M";
  const h = Math.floor(n / 60);
  const r = n % 60;
  return `PT${h ? `${h}H` : ""}${r ? `${r}M` : h ? "" : "0M"}`;
};

const isoToMinutes = (iso: string) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return (parseInt(m?.[1] || "0") * 60 + parseInt(m?.[2] || "0")).toString();
};

export function RecipeForm({
  recipe,
  onSaved,
  onCancel,
}: {
  recipe?: Recipe;
  onSaved?: (r: Recipe) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(blank());
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const saving = createRecipe.isPending || updateRecipe.isPending;

  useEffect(() => {
    if (recipe) {
      setForm({
        name: recipe.name,
        description: recipe.description,
        image: recipe.image[0] || "",
        prepTime: isoToMinutes(recipe.prepTime),
        cookTime: isoToMinutes(recipe.cookTime),
        yield: recipe.recipeYield,
        category: recipe.recipeCategory,
        cuisine: recipe.recipeCuisine,
        keywords: recipe.keywords.join(", "),
        ingredients: recipe.recipeIngredient.length ? recipe.recipeIngredient : [""],
        instructions: recipe.recipeInstructions.length
          ? instructionTexts(recipe.recipeInstructions)
          : [""],
        structuredInstructions: recipe.recipeInstructions.length ? recipe.recipeInstructions : null,
        schemaJson: recipe,
      });
    } else {
      setForm(blank());
    }
  }, [recipe]);

  const update = <K extends keyof RecipeFormState>(k: K, v: RecipeFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setIng = (i: number, v: string) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((x, j) => (i === j ? v : x)) }));
  const addIng = () => setForm((f) => ({ ...f, ingredients: [...f.ingredients, ""] }));
  const delIng = (i: number) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, j) => j !== i) || [""] }));

  const setStep = (i: number, v: string) =>
    setForm((f) => ({
      ...f,
      structuredInstructions: null,
      instructions: f.instructions.map((x, j) => (i === j ? v : x)),
    }));
  const addStep = () =>
    setForm((f) => ({
      ...f,
      structuredInstructions: null,
      instructions: [...f.instructions, ""],
    }));
  const delStep = (i: number) =>
    setForm((f) => {
      const instructions = f.instructions.filter((_, j) => j !== i);
      return {
        ...f,
        structuredInstructions: null,
        instructions: instructions.length ? instructions : [""],
      };
    });

  const tryImportJsonLd = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const parsed: unknown = JSON.parse(txt);
      const data = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!isRecord(data)) throw new Error("Invalid JSON-LD");

      const graph = data["@graph"];
      const graphRecipe = Array.isArray(graph) ? graph.find(isRecipeNode) : undefined;
      const r = isRecord(graphRecipe) ? graphRecipe : data;
      const image = Array.isArray(r.image) ? r.image[0] : r.image;
      const ingredients = asStringArray(r.recipeIngredient);
      const structuredInstructions = normalizeInstructions(r.recipeInstructions);
      const steps = instructionTexts(structuredInstructions);

      setForm({
        name: asString(r.name),
        description: asString(r.description),
        image: asString(image),
        prepTime: isoToMinutes(asString(r.prepTime, "PT0M")),
        cookTime: isoToMinutes(asString(r.cookTime, "PT0M")),
        yield: asString(r.recipeYield, "4 servings"),
        category: asString(r.recipeCategory, "Main Course"),
        cuisine: asString(r.recipeCuisine),
        keywords: Array.isArray(r.keywords)
          ? asStringArray(r.keywords).join(", ")
          : asString(r.keywords),
        ingredients: ingredients.length ? ingredients : [""],
        instructions: steps.length ? steps : [""],
        structuredInstructions: structuredInstructions.length ? structuredInstructions : null,
        schemaJson: r,
      });
      toast.success("Imported Schema.org Recipe from clipboard");
    } catch {
      toast.error("Couldn't read JSON-LD from clipboard");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Recipe needs a name");
      return;
    }
    const ingredients = form.ingredients.map((s) => s.trim()).filter(Boolean);
    const instructions = form.instructions.map((s) => s.trim()).filter(Boolean);
    const prep = minutesToISO(form.prepTime);
    const cook = minutesToISO(form.cookTime);
    const total = `PT${parseInt(form.prepTime || "0") + parseInt(form.cookTime || "0") || 0}M`;
    const image = form.image
      ? [form.image]
      : ["https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=1200&q=80"];
    const keywords = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const recipeInstructions =
      form.structuredInstructions ??
      instructions.map((text) => ({ "@type": "HowToStep" as const, text }));

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      image,
      // Author is derived on the server from the creator's user id — not sent.
      prepTime: prep,
      cookTime: cook,
      totalTime: total,
      recipeYield: form.yield,
      recipeCategory: form.category,
      recipeCuisine: form.cuisine || "Modern",
      keywords,
      recipeIngredient: ingredients,
      recipeInstructions,
      schemaJson: {
        ...(form.schemaJson ?? {}),
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: form.name.trim(),
        description: form.description.trim(),
        image,
        prepTime: prep,
        cookTime: cook,
        totalTime: total,
        recipeYield: form.yield,
        recipeCategory: form.category,
        recipeCuisine: form.cuisine || "Modern",
        keywords,
        recipeIngredient: ingredients,
        recipeInstructions,
      },
    };

    try {
      if (recipe) {
        const updated = await updateRecipe.mutateAsync({ id: recipe.identifier, patch: payload });
        toast.success("Recipe updated");
        onSaved?.(updated);
      } else {
        const created = await createRecipe.mutateAsync(payload);
        toast.success("Recipe added to your library");
        onSaved?.(created);
      }
    } catch {
      toast.error("Couldn't save recipe. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5 bg-card border border-border rounded-2xl p-4 sm:p-6">
        <div>
          <h2 className="text-display text-2xl">Recipe details</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stored as a Schema.org Recipe — portable to any compliant tool.
          </p>
        </div>

        <button
          type="button"
          onClick={tryImportJsonLd}
          className="w-full inline-flex items-center justify-center gap-2 min-h-10 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 hover:bg-secondary text-sm transition"
        >
          <Sparkles className="size-4 shrink-0 text-accent" />
          <span>Paste JSON-LD from clipboard to autofill</span>
        </button>

        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Lemon roasted chicken"
            autoFocus
          />
        </Field>

        <Field label="Description">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="A short, mouth-watering blurb"
          />
        </Field>

        <Field label="Cover image URL">
          <Input
            value={form.image}
            onChange={(e) => update("image", e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Prep (min)">
            <Input
              type="number"
              min={0}
              value={form.prepTime}
              onChange={(e) => update("prepTime", e.target.value)}
            />
          </Field>
          <Field label="Cook (min)">
            <Input
              type="number"
              min={0}
              value={form.cookTime}
              onChange={(e) => update("cookTime", e.target.value)}
            />
          </Field>
          <Field label="Yield">
            <Input value={form.yield} onChange={(e) => update("yield", e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => update("category", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cuisine">
            <Input
              value={form.cuisine}
              onChange={(e) => update("cuisine", e.target.value)}
              placeholder="Italian, Japanese…"
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <Input
              value={form.keywords}
              onChange={(e) => update("keywords", e.target.value)}
              placeholder="weeknight, vegan"
            />
          </Field>
        </div>
      </div>

      <aside className="order-last lg:order-none lg:row-span-2 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 lg:sticky lg:top-28">
          <h2 className="text-display text-xl mb-3">Save recipe</h2>
          <p className="text-sm text-muted-foreground">
            Add ingredients and method steps, then save to your library.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? "Saving…" : recipe ? "Save changes" : "Add recipe"}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 px-5 rounded-full border border-border bg-card text-sm hover:bg-accent hover:text-accent-foreground transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-5 bg-card border border-border rounded-2xl p-4 sm:p-6">
        <RepeatList
          label="Ingredients"
          items={form.ingredients}
          placeholder="e.g. 2 cloves garlic, minced"
          onChange={setIng}
          onAdd={addIng}
          onRemove={delIng}
        />

        <RepeatList
          label="Method"
          items={form.instructions}
          placeholder="Step-by-step instructions"
          multiline
          onChange={setStep}
          onAdd={addStep}
          onRemove={delStep}
        />
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RepeatList({
  label,
  items,
  placeholder,
  multiline,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: string[];
  placeholder?: string;
  multiline?: boolean;
  onChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="space-y-2">
        {items.map((v, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="shrink-0 mt-2 text-xs text-muted-foreground w-5 text-right">
              {i + 1}.
            </div>
            {multiline ? (
              <Textarea
                rows={2}
                value={v}
                onChange={(e) => onChange(i, e.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1"
              />
            ) : (
              <Input
                value={v}
                onChange={(e) => onChange(i, e.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1"
              />
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="mt-1 size-9 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Plus className="size-4" /> Add{" "}
        {label.toLowerCase().endsWith("s") ? label.toLowerCase().slice(0, -1) : label.toLowerCase()}
      </button>
    </div>
  );
}

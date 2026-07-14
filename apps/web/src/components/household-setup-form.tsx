import { useState } from "react";
import { Home, UtensilsCrossed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { cn } from "@/lib/utils";
import { useCreateHousehold } from "@/hooks/mutations";
import { ApiError } from "@/lib/api";

type Kind = "Household" | "Restaurant";

const options: { type: Kind; icon: typeof Home; blurb: string }[] = [
  { type: "Household", icon: Home, blurb: "Cook for your family or yourself" },
  { type: "Restaurant", icon: UtensilsCrossed, blurb: "Run a kitchen with a team" },
];

/**
 * Pick a household/restaurant type, name it, and create it. Used by the
 * onboarding screen and the sidebar "Create household" dialog.
 */
export function HouseholdSetupForm({
  firstName,
  onCreated,
}: {
  firstName?: string;
  onCreated?: () => void;
}) {
  const createHousehold = useCreateHousehold();
  const [type, setType] = useState<Kind>("Household");
  const [name, setName] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = firstName ? `${firstName}'s ` : "";
  const suggested = type === "Household" ? `${base}Kitchen` : `${base}Restaurant`;
  const value = touchedName ? name : suggested;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalName = value.trim();
    if (!finalName) {
      setError("Give your kitchen a name.");
      return;
    }
    try {
      await createHousehold.mutateAsync({ name: finalName, type });
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {options.map(({ type: t, icon: Icon, blurb }) => (
          <Button
            key={t}
            type="button"
            variant="ghost"
            onClick={() => setType(t)}
            className={cn(
              "h-auto flex-col items-start justify-start gap-2 whitespace-normal rounded-xl border p-4 text-left font-normal hover:text-foreground [&_svg]:size-5",
              type === t
                ? "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5"
                : "border-border hover:border-foreground/30 hover:bg-transparent",
            )}
          >
            <Icon className={cn("size-5", type === t ? "text-primary" : "text-muted-foreground")} />
            <div className="text-sm font-medium">{t}</div>
            <div className="text-xs text-muted-foreground leading-snug">{blurb}</div>
          </Button>
        ))}
      </div>

      <Field label={type === "Restaurant" ? "Restaurant name" : "Household name"}>
        <Input
          value={value}
          onChange={(e) => {
            setTouchedName(true);
            setName(e.target.value);
          }}
          placeholder={suggested}
          autoFocus
        />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={createHousehold.isPending}
        className="h-11 w-full rounded-full shadow-none hover:bg-primary hover:opacity-90 disabled:opacity-60"
      >
        {createHousehold.isPending ? "Creating…" : `Create ${type.toLowerCase()}`}
      </Button>
    </form>
  );
}

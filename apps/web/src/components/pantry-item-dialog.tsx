import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePantry, useUpdatePantry } from "@/hooks/mutations";
import type { PantryItem } from "@/lib/mock-data";
import { toast } from "sonner";

const locations = ["Pantry", "Fridge", "Freezer"] as const;

export function PantryItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: PantryItem;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("1");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<(typeof locations)[number]>("Pantry");
  const [expires, setExpires] = useState("");
  const createItem = useCreatePantry();
  const updateItem = useUpdatePantry();

  useEffect(() => {
    if (!open) return;
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setValue(String(item.quantity.value));
      setUnit(item.quantity.unitText);
      setLocation(item.location);
      setExpires(item.expires ?? "");
    } else {
      setName("");
      setCategory("");
      setValue("1");
      setUnit("");
      setLocation("Pantry");
      setExpires("");
    }
  }, [open, item]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const payload = {
      name: name.trim(),
      category,
      quantity: {
        "@type": "QuantitativeValue" as const,
        value: parseFloat(value) || 0,
        unitText: unit,
      },
      location,
      expires: expires || undefined,
    };
    try {
      if (item) {
        await updateItem.mutateAsync({ id: item.identifier, patch: payload });
        toast.success("Pantry item updated");
      } else {
        await createItem.mutateAsync(payload);
        toast.success("Added to pantry");
      }
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save the item. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-display text-2xl sm:text-3xl font-normal">
            {item ? "Edit item" : "Add to pantry"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Item">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Olive oil"
            />
          </Field>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="Category">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Produce, Dairy…"
              />
            </Field>
            <Field label="Location">
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as (typeof locations)[number])}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {locations.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="Quantity">
              <Input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="g, ml, ct…"
              />
            </Field>
          </div>
          <Field label="Expires (optional)">
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 px-5 rounded-full border border-border bg-card text-sm hover:bg-accent hover:text-accent-foreground transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              {item ? "Save" : "Add"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

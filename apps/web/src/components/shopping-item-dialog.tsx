import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { useCreateShopping, useUpdateShopping } from "@/hooks/mutations";
import type { ShoppingItem } from "common";
import { toast } from "sonner";

const categories = [
  "Produce",
  "Meat",
  "Dairy",
  "Pantry",
  "Condiments",
  "Frozen",
  "Bakery",
  "Other",
];

export function ShoppingItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: ShoppingItem;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("Produce");
  const createItem = useCreateShopping();
  const updateItem = useUpdateShopping();

  useEffect(() => {
    if (!open) return;
    if (item) {
      setName(item.name);
      setQuantity(item.quantity);
      setCategory(item.category);
    } else {
      setName("");
      setQuantity("");
      setCategory("Produce");
    }
  }, [open, item]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    try {
      if (item) {
        await updateItem.mutateAsync({
          id: item.id,
          patch: { name: name.trim(), quantity, category },
        });
        toast.success("Item updated");
      } else {
        await createItem.mutateAsync({ name: name.trim(), quantity, category });
        toast.success("Added to shopping list");
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
            {item ? "Edit item" : "Add to shopping"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Item">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Heirloom tomatoes"
            />
          </Field>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="Quantity">
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="500 g"
              />
            </Field>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-full border border-border bg-card px-5 font-normal hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-10 rounded-full px-6 shadow-none hover:bg-primary hover:opacity-90"
            >
              {item ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

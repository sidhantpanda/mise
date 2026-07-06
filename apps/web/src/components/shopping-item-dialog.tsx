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
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Item
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Heirloom tomatoes"
            />
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Quantity
              </Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="500 g"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Category
              </Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
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

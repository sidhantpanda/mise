import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PrimaryButton } from "@/components/AppShell";
import { type ShoppingItem } from "@/lib/mock-data";
import { useShopping } from "@/hooks";
import { useClearChecked, useDeleteShopping, useSetShoppingChecked } from "@/hooks/mutations";
import { Check, CheckCheck, Pencil, Square, Trash2 } from "lucide-react";
import { ShoppingItemDialog } from "@/components/shopping-item-dialog";

export const Route = createFileRoute("/shopping-list")({
  head: () => ({
    meta: [
      { title: "Shopping List — Mise" },
      {
        name: "description",
        content: "An auto-generated shopping list rolled up from your meal plan.",
      },
      { property: "og:title", content: "Shopping List — Mise" },
      {
        property: "og:description",
        content: "An auto-generated shopping list rolled up from your meal plan.",
      },
    ],
  }),
  component: ShoppingPage,
});

function ShoppingPage() {
  const items = useShopping().data ?? [];
  const clearChecked = useClearChecked();
  const setShoppingChecked = useSetShoppingChecked();
  const deleteItem = useDeleteShopping();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | undefined>();

  const byCategory = items.reduce<Record<string, ShoppingItem[]>>((acc, it) => {
    (acc[it.category] ||= []).push(it);
    return acc;
  }, {});

  const done = items.filter((i) => i.checked).length;
  const pct = items.length ? (done / items.length) * 100 : 0;
  const allChecked = items.length > 0 && done === items.length;
  const bulkCheckedLabel = allChecked ? "Deselect all" : "Select all";

  return (
    <AppShell
      title="Shopping list"
      subtitle={`${items.length - done} of ${items.length} items left · rolled up from your meal plan`}
      actions={
        <>
          {items.length > 0 && (
            <button
              onClick={() =>
                setShoppingChecked.mutate({
                  ids: items.map((item) => item.id),
                  checked: !allChecked,
                })
              }
              disabled={setShoppingChecked.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm whitespace-nowrap transition hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
            >
              {allChecked ? <Square className="size-4" /> : <CheckCheck className="size-4" />}
              {bulkCheckedLabel}
            </button>
          )}
          {done > 0 && (
            <button
              onClick={() => clearChecked.mutate()}
              className="h-9 px-4 rounded-full text-sm border border-border bg-card whitespace-nowrap hover:bg-accent hover:text-accent-foreground transition"
            >
              Clear checked
            </button>
          )}
          <PrimaryButton onClick={() => setOpen(true)}>Add item</PrimaryButton>
        </>
      }
    >
      <div className="max-w-3xl">
        <div className="mb-8">
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Nothing to buy. Add ingredients from a recipe or create an item.
          </div>
        ) : (
          <div className="space-y-7">
            {Object.entries(byCategory).map(([cat, xs]) => (
              <section key={cat}>
                <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
                  {cat} · {xs.length}
                </h2>
                <ul className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                  {xs.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 group">
                      <button
                        onClick={() =>
                          setShoppingChecked.mutate({ ids: [it.id], checked: !it.checked })
                        }
                        disabled={setShoppingChecked.isPending}
                        className={`size-6 shrink-0 rounded-full border-2 grid place-items-center transition ${
                          it.checked
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {it.checked && <Check className="size-3.5" strokeWidth={3} />}
                      </button>
                      <div
                        className={`flex-1 min-w-0 ${it.checked ? "line-through text-muted-foreground" : ""}`}
                      >
                        <div className="text-sm font-medium truncate">{it.name}</div>
                        {it.quantity && (
                          <div className="text-xs text-muted-foreground">{it.quantity}</div>
                        )}
                      </div>
                      <button
                        onClick={() => setEditing(it)}
                        className="shrink-0 text-muted-foreground transition hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => deleteItem.mutate(it.id)}
                        className="shrink-0 text-muted-foreground transition hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Remove"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <ShoppingItemDialog open={open} onOpenChange={setOpen} />
      <ShoppingItemDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(undefined)}
        item={editing}
      />
    </AppShell>
  );
}

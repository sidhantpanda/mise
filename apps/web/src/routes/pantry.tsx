import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PrimaryButton, SearchBar } from "@/components/AppShell";
import type { PantryItem } from "common";
import { usePantry } from "@/hooks";
import { PantryItemDialog } from "@/components/pantry-item-dialog";
import { PantryDeleteButton } from "@/components/pantry-delete-button";
import { Button } from "@/components/ui/button";
import { Refrigerator, Snowflake, Archive } from "lucide-react";

export const Route = createFileRoute("/pantry")({
  head: () => ({
    meta: [
      { title: "Pantry - Mise" },
      {
        name: "description",
        content: "Track what you have on hand across pantry, fridge, and freezer.",
      },
      { property: "og:title", content: "Pantry - Mise" },
      {
        property: "og:description",
        content: "Track what you have on hand across pantry, fridge, and freezer.",
      },
    ],
  }),
  component: PantryPage,
});

const locations = [
  { key: "All", icon: Archive },
  { key: "Pantry", icon: Archive },
  { key: "Fridge", icon: Refrigerator },
  { key: "Freezer", icon: Snowflake },
] as const;

const EMPTY: PantryItem[] = [];

function PantryPage() {
  const pantry = usePantry().data ?? EMPTY;
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<(typeof locations)[number]["key"]>("All");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PantryItem | undefined>();

  const filtered = useMemo(
    () =>
      pantry.filter(
        (p) =>
          (loc === "All" || p.location === loc) &&
          (!q || p.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [pantry, q, loc],
  );

  return (
    <AppShell
      title="Pantry"
      subtitle={`${pantry.length} items · tracked as Schema.org Product entries`}
      actions={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Search pantry…" />
          <PrimaryButton onClick={() => setAdding(true)}>Add item</PrimaryButton>
        </>
      }
    >
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {locations.map(({ key, icon: Icon }) => (
          <Button
            key={key}
            variant="ghost"
            onClick={() => setLoc(key)}
            className={`shrink-0 gap-1.5 rounded-full border px-4 py-2 text-xs font-medium ${
              loc === key
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground"
                : "bg-card border-border text-foreground/70 hover:border-foreground/30 hover:bg-card hover:text-foreground/70"
            }`}
          >
            <Icon className="size-3.5" />
            {key}
          </Button>
        ))}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.map((p) => {
          const days = p.expires
            ? Math.ceil((new Date(p.expires).getTime() - Date.now()) / 86400000)
            : null;
          const urgent = days !== null && days <= 5;
          return (
            <article
              key={p.identifier}
              onClick={() => setEditing(p)}
              className="cursor-pointer rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium leading-tight wrap-break-word">{p.name}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{p.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-secondary">
                    {p.location}
                  </span>
                  <PantryDeleteButton id={p.identifier} name={p.name} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Quantity
                  </div>
                  <div className="mt-0.5">
                    {p.quantity.value}{" "}
                    <span className="text-muted-foreground">{p.quantity.unitText}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Expires
                  </div>
                  <div
                    className={
                      urgent ? "mt-0.5 text-accent font-medium" : "mt-0.5 text-muted-foreground"
                    }
                  >
                    {days !== null ? `${days}d` : "-"}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3">Item</th>
              <th className="text-left px-5 py-3">Category</th>
              <th className="text-left px-5 py-3">Quantity</th>
              <th className="text-left px-5 py-3">Location</th>
              <th className="text-left px-5 py-3">Expires</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
              const days = p.expires
                ? Math.ceil((new Date(p.expires).getTime() - Date.now()) / 86400000)
                : null;
              const urgent = days !== null && days <= 5;
              return (
                <tr
                  key={p.identifier}
                  onClick={() => setEditing(p)}
                  className="cursor-pointer hover:bg-secondary/30 transition"
                >
                  <td className="px-5 py-3.5 font-medium">{p.name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{p.category}</td>
                  <td className="px-5 py-3.5">
                    {p.quantity.value}{" "}
                    <span className="text-muted-foreground">{p.quantity.unitText}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-secondary">
                      {p.location}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.expires ? (
                      <span
                        className={urgent ? "text-accent font-medium" : "text-muted-foreground"}
                      >
                        {days}d
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <PantryDeleteButton id={p.identifier} name={p.name} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PantryItemDialog open={adding} onOpenChange={setAdding} />
      <PantryItemDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(undefined)}
        item={editing}
      />
    </AppShell>
  );
}

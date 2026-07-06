import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { RecipeLayout } from "@/components/recipes/recipe-layout";
import { cn } from "@/lib/utils";

// A call-to-action tile shown at the end of a recipe list — e.g. "Add a new
// recipe" (opens the add dialog) or "Contribute your recipe" (links out). It
// mirrors each layout's card footprint so it slots in as just another item.
export type RecipeCta = {
  title: string;
  description: string;
  actionLabel: string;
  icon: LucideIcon;
  // Provide exactly one: onClick for in-app actions (e.g. open a dialog), or
  // href for an external link (opens in a new tab).
  onClick?: () => void;
  href?: string;
};

function CtaShell({
  cta,
  className,
  children,
}: {
  cta: RecipeCta;
  className: string;
  children: ReactNode;
}) {
  const shared = cn(
    "group cursor-pointer border border-dashed border-border bg-card/40 text-left transition hover:border-primary hover:bg-primary/5",
    className,
  );

  if (cta.href) {
    return (
      <a href={cta.href} target="_blank" rel="noreferrer" className={shared}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={shared}>
      {children}
    </button>
  );
}

function ActionRow({ cta }: { cta: RecipeCta }) {
  const Arrow = cta.href ? ArrowUpRight : ArrowRight;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
      {cta.actionLabel}
      <Arrow className="size-4 transition group-hover:translate-x-0.5" />
    </span>
  );
}

export function RecipeCtaCard({ cta, layout }: { cta: RecipeCta; layout: RecipeLayout }) {
  const Icon = cta.icon;

  if (layout === RecipeLayout.Compact) {
    return (
      <CtaShell cta={cta} className="flex h-full min-h-24 items-center gap-3 rounded-lg p-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug">{cta.title}</span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
            {cta.description}
          </span>
        </span>
      </CtaShell>
    );
  }

  if (layout === RecipeLayout.List) {
    return (
      <CtaShell
        cta={cta}
        className="flex min-h-24 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl p-4 text-center"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-display text-lg leading-tight">{cta.title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{cta.description}</span>
        </span>
        <ActionRow cta={cta} />
      </CtaShell>
    );
  }

  // Grid (default): mirrors the RecipeGridCard footprint.
  return (
    <CtaShell
      cta={cta}
      className="flex h-full min-h-72 flex-col items-center justify-center rounded-2xl p-6 text-center"
    >
      <span className="grid size-14 place-items-center rounded-full bg-secondary text-foreground">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-5 text-display text-xl leading-tight">{cta.title}</h3>
      <p className="mt-2 max-w-[26ch] text-sm text-muted-foreground">{cta.description}</p>
      <span className="mt-5">
        <ActionRow cta={cta} />
      </span>
    </CtaShell>
  );
}

// Table variant lives in its own row spanning every column so it reads as a
// full-width footer beneath the rows.
export function RecipeCtaTableRow({ cta, colSpan }: { cta: RecipeCta; colSpan: number }) {
  const Icon = cta.icon;
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <CtaShell
          cta={cta}
          className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-none px-4 py-4 text-sm"
        >
          <Icon className="size-4 text-primary" />
          <span className="font-medium">{cta.title}</span>
          <span className="text-muted-foreground">— {cta.description}</span>
          <ArrowRightForTable cta={cta} />
        </CtaShell>
      </TableCell>
    </TableRow>
  );
}

function ArrowRightForTable({ cta }: { cta: RecipeCta }) {
  const Arrow = cta.href ? ArrowUpRight : ArrowRight;
  return <Arrow className="size-4 text-primary transition group-hover:translate-x-0.5" />;
}

import { Grid2X2, Grid3X3, List, Table2, type LucideIcon } from "lucide-react";
import { RecipeLayout } from "@/components/recipes/recipe-layout";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const recipeLayouts = [
  { value: RecipeLayout.Grid, label: "Grid", Icon: Grid2X2 },
  { value: RecipeLayout.Compact, label: "Compact grid", Icon: Grid3X3 },
  { value: RecipeLayout.List, label: "List", Icon: List },
  { value: RecipeLayout.Table, label: "Table", Icon: Table2 },
] as const satisfies { value: RecipeLayout; label: string; Icon: LucideIcon }[];

export function RecipeLayoutSwitcher({
  layout,
  onLayoutChange,
  className,
  buttonClassName,
}: {
  layout: RecipeLayout;
  onLayoutChange: (layout: RecipeLayout) => void;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "flex w-fit shrink-0 items-center rounded-full border border-border bg-card p-1",
          className,
        )}
        aria-label="Recipe layout"
      >
        {recipeLayouts.map(({ value, label, Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${label} layout`}
                aria-pressed={layout === value}
                onClick={() => onLayoutChange(value)}
                className={cn(
                  "size-9 shrink-0 rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground",
                  layout === value &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  buttonClassName,
                )}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

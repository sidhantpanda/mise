import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, FileArchive, Globe, PencilLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddRecipeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add recipe</DialogTitle>
          <DialogDescription>Choose how you want to add recipes to your library.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/recipes/library" });
            }}
            className="group flex min-h-44 flex-col rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <span className="grid size-11 place-items-center rounded-lg bg-secondary text-foreground">
              <Globe className="size-5" />
            </span>
            <span className="mt-4 text-display text-xl">Browse public library</span>
            <span className="mt-2 text-sm text-muted-foreground">
              Import curated community recipes with one click.
            </span>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
              Browse <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/recipes/upload" });
            }}
            className="group flex min-h-44 flex-col rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <span className="grid size-11 place-items-center rounded-lg bg-secondary text-foreground">
              <FileArchive className="size-5" />
            </span>
            <span className="mt-4 text-display text-xl">Upload JSON-LD or ZIP</span>
            <span className="mt-2 text-sm text-muted-foreground">
              Import one JSON-LD file or a ZIP of JSON-LD files.
            </span>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
              Upload <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/recipes/new" });
            }}
            className="group flex min-h-44 flex-col rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <span className="grid size-11 place-items-center rounded-lg bg-secondary text-foreground">
              <PencilLine className="size-5" />
            </span>
            <span className="mt-4 text-display text-xl">Create via UI</span>
            <span className="mt-2 text-sm text-muted-foreground">
              Build a recipe with the current guided form.
            </span>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
              Create <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

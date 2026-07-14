import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeletePantry } from "@/hooks/mutations";

// Pulled out of pantry.tsx so it can be exercised in isolation: the route
// renders the same row data twice (mobile card + desktop table), so this one
// component backs both copies instead of duplicating the click handler.
export function PantryDeleteButton({ id, name }: { id: string; name: string }) {
  const deleteItem = useDeletePantry();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation();
        deleteItem.mutate(id);
      }}
      className="size-auto p-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
      aria-label={`Remove ${name}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

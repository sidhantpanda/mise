import * as React from "react";
import { useIsReadOnly } from "@/hooks/read-only";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DEFAULT_LABEL = "This is a read-only demo account";

type WriteGuardProps = {
  /** A single focusable control that accepts a `disabled` prop. */
  children: React.ReactElement<{ disabled?: boolean }>;
  /** Overrides the tooltip copy when a control needs to say something specific. */
  label?: string;
  /** Renders the tooltip on this side; matches Radix's `side`. */
  side?: React.ComponentPropsWithoutRef<typeof TooltipContent>["side"];
  /**
   * Classes for the wrapper span. Only needed where the wrapper would otherwise
   * break the parent's layout — e.g. `w-full` for a full-width control.
   */
  className?: string;
};

/**
 * Disables a write control for read-only accounts and explains why on hover.
 *
 * For ordinary accounts this renders `children` untouched — no wrapper element,
 * no tooltip machinery — so it is safe to leave in place everywhere.
 *
 * Usage:
 *   <WriteGuard>
 *     <Button onClick={save}>Save recipe</Button>
 *   </WriteGuard>
 */
export function WriteGuard({ children, label, side = "bottom", className }: WriteGuardProps) {
  const isReadOnly = useIsReadOnly();
  if (!isReadOnly) return children;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        {/* A disabled control emits no pointer events, so the tooltip has to be
            triggered by a wrapper that still receives them. The span is
            focusable so the explanation is reachable by keyboard too. */}
        <TooltipTrigger asChild>
          <span className={cn("inline-flex cursor-not-allowed", className)} tabIndex={0}>
            {React.cloneElement(children, { disabled: true })}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side}>{label ?? DEFAULT_LABEL}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

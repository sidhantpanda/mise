import { cloneElement, useId, type AriaAttributes, type ReactElement } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldControlProps = Pick<AriaAttributes, "aria-invalid" | "aria-describedby"> & {
  id?: string;
};

// The shared wrapper for "<Label> above a control" fields used throughout the
// app's forms (login, signup, recipe/pantry/shopping/meal dialogs, access
// tokens, household settings). Previously each call site rendered a bare
// <Label> with no `htmlFor`, so no input in the app had a programmatic
// label association — screen readers couldn't announce the field, and it
// couldn't be selected with `getByLabel` in tests. This generates an id (or
// uses the one the caller passed) and wires it to both the label and the
// control, plus the error message via `aria-describedby`/`aria-invalid`.
export function Field({
  label,
  children,
  error,
  id,
  className,
}: {
  label: string;
  children: ReactElement<FieldControlProps>;
  error?: string | null;
  id?: string;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={controlId}
        className="text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      {cloneElement(children, {
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

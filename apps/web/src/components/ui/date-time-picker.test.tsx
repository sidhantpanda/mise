import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Field } from "@/components/field";
import { DateTimePicker } from "./date-time-picker";

describe("DateTimePicker", () => {
  // Regression: the picker used to drop the id/aria props a wrapping <Field>
  // clones onto it, so its label ("Expires" on the access-token form) resolved to
  // nothing — the one form control in the app that stayed unlabeled after the
  // Field migration.
  it("forwards a Field's id/label to the trigger, so getByLabel resolves it", () => {
    render(
      <Field label="Expires">
        <DateTimePicker value={null} onChange={vi.fn()} placeholder="No expiry" />
      </Field>,
    );
    expect(screen.getByLabelText("Expires")).toBeInstanceOf(HTMLButtonElement);
  });

  it("reflects the error state via aria-invalid/aria-describedby", () => {
    render(
      <Field label="Expires" error="Pick a date">
        <DateTimePicker value={null} onChange={vi.fn()} />
      </Field>,
    );
    const control = screen.getByLabelText("Expires");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription("Pick a date");
  });
});

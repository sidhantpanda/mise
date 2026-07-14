import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";

describe("Field", () => {
  it("associates the label with the control, so getByLabel resolves it", () => {
    render(
      <Field label="Email">
        <input type="email" />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toBeInstanceOf(HTMLInputElement);
  });

  it("generates a distinct id per instance when none is supplied", () => {
    render(
      <>
        <Field label="First">
          <input />
        </Field>
        <Field label="Second">
          <input />
        </Field>
      </>,
    );
    const first = screen.getByLabelText("First") as HTMLInputElement;
    const second = screen.getByLabelText("Second") as HTMLInputElement;
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });

  it("uses a caller-supplied id instead of generating one", () => {
    render(
      <Field label="Name" id="explicit-id">
        <input />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute("id", "explicit-id");
  });

  it("leaves aria-invalid and aria-describedby unset when there is no error", () => {
    render(
      <Field label="Email">
        <input />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("wires aria-invalid and aria-describedby to the error message when there is an error", () => {
    render(
      <Field label="Email" error="Enter a valid email address">
        <input />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const errorMessage = screen.getByText("Enter a valid email address");
    expect(input.getAttribute("aria-describedby")).toBe(errorMessage.id);
  });
});

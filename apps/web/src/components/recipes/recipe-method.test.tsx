import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RecipeInstruction } from "common";
import { RecipeMethod } from "./recipe-method";

describe("RecipeMethod", () => {
  it("renders a flat list of HowToSteps as numbered steps", () => {
    const instructions: RecipeInstruction[] = [
      { "@type": "HowToStep", text: "Chop onions." },
      { "@type": "HowToStep", text: "Boil water." },
    ];
    render(<RecipeMethod instructions={instructions} />);
    expect(screen.getByText("Chop onions.")).toBeInTheDocument();
    expect(screen.getByText("Boil water.")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders a HowToSection with its heading and numbers steps across sections", () => {
    const instructions: RecipeInstruction[] = [
      {
        "@type": "HowToSection",
        name: "Prep",
        itemListElement: [{ "@type": "HowToStep", text: "Chop onions." }],
      },
      {
        "@type": "HowToSection",
        name: "Cook",
        itemListElement: [{ "@type": "HowToStep", text: "Boil water." }],
      },
    ];
    render(<RecipeMethod instructions={instructions} />);
    expect(screen.getByRole("heading", { name: "Prep" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cook" })).toBeInTheDocument();
    // Numbering continues across sections rather than restarting at each one.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("skips an empty section entirely", () => {
    const instructions: RecipeInstruction[] = [
      { "@type": "HowToSection", name: "Empty", itemListElement: [] },
      { "@type": "HowToStep", text: "Only step." },
    ];
    render(<RecipeMethod instructions={instructions} />);
    expect(screen.queryByRole("heading", { name: "Empty" })).not.toBeInTheDocument();
    expect(screen.getByText("Only step.")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("omits the heading for an unnamed section", () => {
    const instructions: RecipeInstruction[] = [
      { "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Step." }] },
    ];
    const { container } = render(<RecipeMethod instructions={instructions} />);
    expect(container.querySelector("h3")).not.toBeInTheDocument();
  });
});

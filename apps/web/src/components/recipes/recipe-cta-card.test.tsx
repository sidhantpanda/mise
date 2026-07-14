import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { RecipeCtaCard, RecipeCtaTableRow, type RecipeCta } from "./recipe-cta-card";
import { RecipeLayout } from "./recipe-layout";

const clickCta: RecipeCta = {
  title: "Add a recipe",
  description: "Start from scratch.",
  actionLabel: "Add recipe",
  icon: Plus,
  onClick: vi.fn(),
};

const linkCta: RecipeCta = {
  title: "Contribute",
  description: "Share with the community.",
  actionLabel: "Learn more",
  icon: Plus,
  href: "https://example.com/contribute",
};

describe("RecipeCtaCard", () => {
  it("renders an onClick cta as a button and fires the handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RecipeCtaCard cta={{ ...clickCta, onClick }} layout={RecipeLayout.Grid} />);

    const button = screen.getByRole("button", { name: /Add a recipe/ });
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders an href cta as an external link, not a button", () => {
    render(<RecipeCtaCard cta={linkCta} layout={RecipeLayout.Grid} />);
    const link = screen.getByRole("link", { name: /Contribute/ });
    expect(link).toHaveAttribute("href", "https://example.com/contribute");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the title and description in the compact layout", () => {
    render(<RecipeCtaCard cta={clickCta} layout={RecipeLayout.Compact} />);
    expect(screen.getByText("Add a recipe")).toBeInTheDocument();
    expect(screen.getByText("Start from scratch.")).toBeInTheDocument();
  });

  it("shows the title, description, and action label in the list layout", () => {
    render(<RecipeCtaCard cta={clickCta} layout={RecipeLayout.List} />);
    expect(screen.getByText("Add a recipe")).toBeInTheDocument();
    expect(screen.getByText("Add recipe")).toBeInTheDocument();
  });
});

describe("RecipeCtaTableRow", () => {
  it("spans the given number of columns", () => {
    render(
      <table>
        <tbody>
          <RecipeCtaTableRow cta={clickCta} colSpan={4} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole("cell")).toHaveAttribute("colspan", "4");
    expect(screen.getByText("Add a recipe")).toBeInTheDocument();
  });
});

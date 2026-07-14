import { screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../../test/render-with-router";
import { makeRecipeFixture } from "../../../test/fixtures/recipe";
import { RecipesLayout } from "./recipe-layouts";
import { RecipeLayout } from "./recipe-layout";

const recipes = [makeRecipeFixture({ identifier: "r1", name: "Miso Ramen" })];

describe("RecipesLayout", () => {
  it("renders nothing for an empty recipe list", async () => {
    const { container } = await renderWithRouter(
      <RecipesLayout recipes={[]} layout={RecipeLayout.Grid} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links each recipe to its detail page in the grid layout", async () => {
    await renderWithRouter(<RecipesLayout recipes={recipes} layout={RecipeLayout.Grid} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recipes/r1");
    expect(screen.getByText("Miso Ramen")).toBeInTheDocument();
  });

  it("links each recipe to its detail page in the compact layout", async () => {
    await renderWithRouter(<RecipesLayout recipes={recipes} layout={RecipeLayout.Compact} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recipes/r1");
  });

  it("links each recipe to its detail page in the list layout", async () => {
    await renderWithRouter(<RecipesLayout recipes={recipes} layout={RecipeLayout.List} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recipes/r1");
  });

  it("renders a table instead of cards in the table layout", async () => {
    await renderWithRouter(<RecipesLayout recipes={recipes} layout={RecipeLayout.Table} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("appends the CTA card when provided", async () => {
    await renderWithRouter(
      <RecipesLayout
        recipes={recipes}
        layout={RecipeLayout.Grid}
        cta={{
          title: "Add a recipe",
          description: "Start from scratch.",
          actionLabel: "Add",
          icon: Plus,
          onClick: () => {},
        }}
      />,
    );
    expect(screen.getByText("Add a recipe")).toBeInTheDocument();
  });
});

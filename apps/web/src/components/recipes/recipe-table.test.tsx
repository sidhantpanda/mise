import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../../test/render-with-router";
import { makeRecipeFixture } from "../../../test/fixtures/recipe";
import { RecipeTable } from "./recipe-table";

function names() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1) // drop the header row
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("RecipeTable", () => {
  it("sorts by name ascending by default", async () => {
    const recipes = [
      makeRecipeFixture({ identifier: "r1", name: "Zucchini bread" }),
      makeRecipeFixture({ identifier: "r2", name: "Apple pie" }),
    ];
    await renderWithRouter(<RecipeTable recipes={recipes} />);
    expect(names()[0]).toContain("Apple pie");
    expect(names()[1]).toContain("Zucchini bread");
  });

  it("reverses direction on a second click of the same column", async () => {
    const user = userEvent.setup();
    const recipes = [
      makeRecipeFixture({ identifier: "r1", name: "Zucchini bread" }),
      makeRecipeFixture({ identifier: "r2", name: "Apple pie" }),
    ];
    await renderWithRouter(<RecipeTable recipes={recipes} />);

    const recipeHeader = screen.getByRole("columnheader", { name: /Recipe/ });
    expect(recipeHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(within(recipeHeader).getByRole("button"));
    expect(recipeHeader).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toContain("Zucchini bread");
  });

  it("sorts recipes missing a value (e.g. no rating) to the end", async () => {
    const user = userEvent.setup();
    const recipes = [
      makeRecipeFixture({ identifier: "r1", name: "No rating", aggregateRating: undefined }),
      makeRecipeFixture({
        identifier: "r2",
        name: "Rated",
        aggregateRating: { "@type": "AggregateRating", ratingValue: 4.2, ratingCount: 3 },
      }),
    ];
    await renderWithRouter(<RecipeTable recipes={recipes} />);

    await user.click(screen.getByRole("button", { name: /Rating/ }));
    expect(names()[0]).toContain("Rated");
    expect(names()[1]).toContain("No rating");
  });

  it("renders a full-width CTA row spanning every column when provided", async () => {
    const recipes = [makeRecipeFixture({ identifier: "r1" })];
    await renderWithRouter(
      <RecipeTable
        recipes={recipes}
        cta={{
          title: "Add a recipe",
          description: "Start from scratch.",
          actionLabel: "Add",
          icon: Plus,
          onClick: () => {},
        }}
      />,
    );
    const ctaCell = screen.getByText("Add a recipe").closest("td");
    expect(ctaCell).toHaveAttribute("colspan", "6");
  });
});

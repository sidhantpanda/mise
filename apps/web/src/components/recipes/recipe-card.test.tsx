import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { makeRecipeFixture } from "../../../test/fixtures/recipe";
import { RecipeEyebrow, RecipeGridCard, RecipeStats } from "./recipe-card";

// RecipeGridCard renders a <Link to="/recipes/$id">, which throws outside a
// router context. A one-route memory router is enough to satisfy it without
// pulling in the app's real route tree (the plan explicitly steers away from
// rendering full route components in Vitest — this stays a component test by
// giving Link just enough context to resolve its href).
async function renderWithRouter(ui: React.ReactElement) {
  const rootRoute = createRootRoute({ component: () => ui });
  const recipeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recipes/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([recipeRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

describe("RecipeGridCard", () => {
  it("shows the recipe's name and description", async () => {
    const recipe = makeRecipeFixture({ name: "Miso Ramen", description: "Rich and savory." });
    await renderWithRouter(<RecipeGridCard recipe={recipe} />);
    expect(screen.getByText("Miso Ramen")).toBeInTheDocument();
    expect(screen.getByText("Rich and savory.")).toBeInTheDocument();
  });

  it("links to the recipe's detail page", async () => {
    const recipe = makeRecipeFixture({ identifier: "abc123" });
    await renderWithRouter(<RecipeGridCard recipe={recipe} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recipes/abc123");
  });

  // The plan called for the card to show "name, time, and author" — the actual
  // component (recipe-card.tsx) never renders an author anywhere; only
  // cuisine/category (RecipeEyebrow) and time/yield/rating (RecipeStats). Tested
  // against what the component actually does below.
  it("shows total time formatted via formatDuration", async () => {
    const recipe = makeRecipeFixture({ totalTime: "PT1H30M" });
    await renderWithRouter(<RecipeGridCard recipe={recipe} />);
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });
});

describe("RecipeEyebrow", () => {
  it("shows cuisine and category", () => {
    render(
      <RecipeEyebrow
        recipe={makeRecipeFixture({ recipeCuisine: "Thai", recipeCategory: "Soup" })}
      />,
    );
    expect(screen.getByText("Thai")).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
  });
});

describe("RecipeStats", () => {
  it("shows the formatted time and yield", () => {
    render(
      <RecipeStats recipe={makeRecipeFixture({ totalTime: "PT45M", recipeYield: "6 servings" })} />,
    );
    expect(screen.getByText(/45 min/)).toBeInTheDocument();
    expect(screen.getByText("6 servings")).toBeInTheDocument();
  });

  it("shows a rating only when aggregateRating is present", () => {
    const withRating = makeRecipeFixture({
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, ratingCount: 12 },
    });
    const { rerender } = render(<RecipeStats recipe={withRating} />);
    expect(screen.getByText("4.5")).toBeInTheDocument();

    rerender(<RecipeStats recipe={makeRecipeFixture({ aggregateRating: undefined })} />);
    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
  });
});

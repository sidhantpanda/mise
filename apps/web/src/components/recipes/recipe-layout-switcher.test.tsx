import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecipeLayoutSwitcher } from "./recipe-layout-switcher";
import { RecipeLayout } from "./recipe-layout";

describe("RecipeLayoutSwitcher", () => {
  it("marks the active layout's button as pressed", () => {
    render(<RecipeLayoutSwitcher layout={RecipeLayout.List} onLayoutChange={() => {}} />);
    expect(screen.getByRole("button", { name: "List layout" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Grid layout" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onLayoutChange with the clicked layout", async () => {
    const user = userEvent.setup();
    const onLayoutChange = vi.fn();
    render(<RecipeLayoutSwitcher layout={RecipeLayout.Grid} onLayoutChange={onLayoutChange} />);

    await user.click(screen.getByRole("button", { name: "Table layout" }));
    expect(onLayoutChange).toHaveBeenCalledWith(RecipeLayout.Table);
  });
});

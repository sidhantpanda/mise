import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddRecipeDialog } from "./add-recipe-dialog";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigateMock,
}));

describe("AddRecipeDialog", () => {
  it("navigates to the public library and closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddRecipeDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /Browse public library/ }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/recipes/library" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("navigates to the upload flow", async () => {
    const user = userEvent.setup();
    render(<AddRecipeDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Upload JSON-LD or ZIP/ }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/recipes/upload" });
  });

  it("navigates to the guided create form", async () => {
    const user = userEvent.setup();
    render(<AddRecipeDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Create via UI/ }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/recipes/new" });
  });

  it("renders nothing when closed", () => {
    render(<AddRecipeDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText("Add recipe")).not.toBeInTheDocument();
  });
});

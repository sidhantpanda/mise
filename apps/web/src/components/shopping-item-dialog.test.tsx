import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { ShoppingItemDialog } from "./shopping-item-dialog";
import type { ShoppingItem } from "common";

function renderDialog(props: Partial<Parameters<typeof ShoppingItemDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(<ShoppingItemDialog open onOpenChange={vi.fn()} {...props} />, {
    wrapper: Wrapper,
  });
}

describe("ShoppingItemDialog", () => {
  it("labels every field so it can be selected accessibly", () => {
    renderDialog();
    expect(screen.getByLabelText("Item")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("creates a new item with the entered fields", async () => {
    const user = userEvent.setup();
    let seenBody: unknown;
    server.use(
      http.post("/api/shopping", async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({ id: "s1", name: "Tomatoes" });
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(screen.getByLabelText("Item"), "Tomatoes");
    await user.type(screen.getByLabelText("Quantity"), "500 g");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(seenBody).toEqual({ name: "Tomatoes", quantity: "500 g", category: "Produce" });
  });

  it("pre-fills the form when editing an existing item", () => {
    const item: ShoppingItem = {
      id: "s1",
      name: "Basil",
      quantity: "1 bunch",
      category: "Produce",
      checked: false,
    };
    renderDialog({ item });
    expect(screen.getByLabelText("Item")).toHaveValue("Basil");
    expect(screen.getByLabelText("Quantity")).toHaveValue("1 bunch");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

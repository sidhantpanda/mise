import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { PantryItemDialog } from "./pantry-item-dialog";
import type { PantryItem } from "common";

function renderDialog(props: Partial<Parameters<typeof PantryItemDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(<PantryItemDialog open onOpenChange={vi.fn()} {...props} />, { wrapper: Wrapper });
}

describe("PantryItemDialog", () => {
  it("labels every field so it can be selected accessibly", () => {
    renderDialog();
    expect(screen.getByLabelText("Item")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Expires (optional)")).toBeInTheDocument();
  });

  it("creates a new item with the entered fields", async () => {
    const user = userEvent.setup();
    let seenBody: unknown;
    server.use(
      http.post("/api/pantry", async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({ identifier: "p1" });
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(screen.getByLabelText("Item"), "Olive oil");
    await user.type(screen.getByLabelText("Unit"), "bottle");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(seenBody).toMatchObject({
      name: "Olive oil",
      location: "Pantry",
      quantity: { "@type": "QuantitativeValue", value: 1, unitText: "bottle" },
    });
  });

  it("pre-fills the form when editing an existing item", () => {
    const item: PantryItem = {
      "@type": "Product",
      identifier: "p1",
      name: "Flour",
      category: "Baking",
      quantity: { "@type": "QuantitativeValue", value: 2, unitText: "kg" },
      location: "Pantry",
    };
    renderDialog({ item });
    expect(screen.getByLabelText("Item")).toHaveValue("Flour");
    expect(screen.getByLabelText("Unit")).toHaveValue("kg");
    expect(screen.getByLabelText("Location")).toHaveValue("Pantry");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

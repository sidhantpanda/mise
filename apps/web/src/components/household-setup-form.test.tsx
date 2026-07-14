import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { HouseholdSetupForm } from "./household-setup-form";

function renderForm(props: Parameters<typeof HouseholdSetupForm>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(<HouseholdSetupForm {...props} />, { wrapper: Wrapper });
}

describe("HouseholdSetupForm", () => {
  it("suggests a name from the first name and the selected type", async () => {
    const user = userEvent.setup();
    renderForm({ firstName: "Ava" });
    expect(screen.getByLabelText("Household name")).toHaveValue("Ava's Kitchen");

    await user.click(screen.getByRole("button", { name: /Restaurant/ }));
    expect(screen.getByLabelText("Restaurant name")).toHaveValue("Ava's Restaurant");
  });

  it("submits the typed name and type, then calls onCreated", async () => {
    const user = userEvent.setup();
    let seenBody: unknown;
    server.use(
      http.post("/api/households", async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({ id: "h1", name: "Test Kitchen", type: "Household" });
      }),
    );
    const onCreated = vi.fn();
    renderForm({ onCreated });

    const nameField = screen.getByLabelText("Household name");
    await user.clear(nameField);
    await user.type(nameField, "Test Kitchen");
    await user.click(screen.getByRole("button", { name: /Create household/ }));

    await screen.findByRole("button", { name: /Create household/ });
    expect(seenBody).toEqual({ name: "Test Kitchen", type: "Household" });
    expect(onCreated).toHaveBeenCalled();
  });

  it("shows a validation error instead of submitting an empty name", async () => {
    const user = userEvent.setup();
    renderForm();
    const nameField = screen.getByLabelText("Household name");
    await user.clear(nameField);
    await user.click(screen.getByRole("button", { name: /Create household/ }));

    expect(await screen.findByText("Give your kitchen a name.")).toBeInTheDocument();
  });

  it("shows the server's error message when creation fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/households", () =>
        HttpResponse.json({ error: "Name already in use" }, { status: 409 }),
      ),
    );
    renderForm();

    await user.click(screen.getByRole("button", { name: /Create household/ }));
    expect(await screen.findByText("Name already in use")).toBeInTheDocument();
  });
});

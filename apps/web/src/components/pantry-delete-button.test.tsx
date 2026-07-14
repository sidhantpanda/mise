import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { PantryDeleteButton } from "./pantry-delete-button";

function renderButton(props: Partial<Parameters<typeof PantryDeleteButton>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(<PantryDeleteButton id="p1" name="Flour" {...props} />, { wrapper: Wrapper });
}

describe("PantryDeleteButton", () => {
  it("renders with an accessible name derived from the item", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Remove Flour" })).toBeInTheDocument();
  });

  it("calls DELETE /api/pantry/:id for the given item on click", async () => {
    const user = userEvent.setup();
    let seenId: string | undefined;
    server.use(
      http.delete("/api/pantry/:id", ({ params }) => {
        seenId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderButton({ id: "p1", name: "Flour" });
    await user.click(screen.getByRole("button", { name: "Remove Flour" }));

    await vi.waitFor(() => expect(seenId).toBe("p1"));
  });

  it("does not bubble the click to a wrapping row's own click handler", async () => {
    const user = userEvent.setup();
    server.use(http.delete("/api/pantry/:id", () => new HttpResponse(null, { status: 204 })));
    const onRowClick = vi.fn();

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <div onClick={onRowClick}>
          <PantryDeleteButton id="p1" name="Flour" />
        </div>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Remove Flour" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../test/msw/handlers";
import { Button } from "@/components/ui/button";
import { WriteGuard } from "./write-guard";

let qc: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockMe({ isReadOnly = false, role }: { isReadOnly?: boolean; role?: string } = {}) {
  server.use(
    http.get("/api/auth/me", () =>
      HttpResponse.json({
        user: { id: "u1", name: "Ava", email: "ava@example.com", avatarColor: "#000", isReadOnly },
        household: role
          ? {
              id: "h1",
              name: "Kitchen",
              type: "Household",
              members: [
                { id: "u1", name: "Ava", email: "ava@example.com", role, avatarColor: "#000" },
              ],
              invitations: [],
            }
          : null,
        households: [],
        invitations: [],
      }),
    ),
  );
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  qc.clear();
});

describe("WriteGuard", () => {
  it("leaves the control clickable for an ordinary account", async () => {
    mockMe({ role: "Member" });
    const onClick = vi.fn();
    render(
      <WriteGuard>
        <Button onClick={onClick}>Add recipe</Button>
      </WriteGuard>,
      { wrapper },
    );

    const button = screen.getByRole("button", { name: "Add recipe" });
    await waitFor(() => expect(button).not.toBeDisabled());
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables the control for a read-only account", async () => {
    mockMe({ isReadOnly: true });
    const onClick = vi.fn();
    render(
      <WriteGuard>
        <Button onClick={onClick}>Add recipe</Button>
      </WriteGuard>,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Add recipe" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Add recipe" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables the control for a Viewer member of the current household", async () => {
    mockMe({ role: "Viewer" });
    const onClick = vi.fn();
    render(
      <WriteGuard>
        <Button onClick={onClick}>Add recipe</Button>
      </WriteGuard>,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Add recipe" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Add recipe" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  // The session is unresolved on first paint; defaulting to "not read-only"
  // keeps ordinary users from seeing every button flash disabled.
  it("does not disable the control while the session is still loading", () => {
    mockMe({ isReadOnly: true });
    render(
      <WriteGuard>
        <Button>Add recipe</Button>
      </WriteGuard>,
      { wrapper },
    );

    expect(screen.getByRole("button", { name: "Add recipe" })).not.toBeDisabled();
  });
});

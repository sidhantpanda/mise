import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateAll } from "./cache";

describe("invalidateAll", () => {
  it("invalidates every query in the client, not a scoped key", () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    invalidateAll(qc);
    expect(invalidateSpy).toHaveBeenCalledWith();
  });
});

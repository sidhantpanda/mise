import { describe, expect, it, vi } from "vitest";
import { setUpClient, withHousehold } from "../helpers/client.js";
import { prisma } from "../../src/prisma.js";

setUpClient();

// middleware/error.ts's generic 500 branch: an error that is neither a ZodError,
// a MulterError, nor an AppError. Every route already goes through a real
// AppError/ZodError somewhere, so the only way to reach this branch is to force
// something further down (Prisma) to reject with a plain Error — same technique
// mcp.test.ts uses for the MCP tool funnel's equivalent branch.
describe("middleware/error.ts generic 500 path", () => {
  it("converts an unexpected error to a generic message and leaks no stack trace or detail", async () => {
    const user = await withHousehold();
    const spy = vi
      .spyOn(prisma.recipe, "findMany")
      .mockRejectedValueOnce(new Error("connection string: postgres://secret@internal-host/db"));

    const res = await user.agent.get("/api/recipes").expect(500);

    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(JSON.stringify(res.body)).not.toContain("postgres://");
    spy.mockRestore();
  });
});

describe("middleware/error.ts notFound handler", () => {
  it("returns a clean 404 for an unmatched /api route", async () => {
    const user = await withHousehold();
    const res = await user.agent.get("/api/this-route-does-not-exist").expect(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

import { describe, expect, it } from "vitest";
import { routeParam } from "../../src/lib/request.js";
import { AppError } from "../../src/lib/AppError.js";

describe("routeParam", () => {
  it("returns the value when it's a non-empty string", () => {
    expect(routeParam("abc", "id")).toBe("abc");
  });

  it.each([undefined, "", ["a", "b"]])("throws AppError(400) for %j", (value) => {
    expect(() => routeParam(value as never, "id")).toThrow(AppError);
    try {
      routeParam(value as never, "id");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).message).toBe("id is required");
    }
  });
});

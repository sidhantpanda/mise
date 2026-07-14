import { describe, expect, it } from "vitest";
import { formatDuration, isoDurationToMinutes } from "./duration.js";

describe("isoDurationToMinutes", () => {
  it("parses minutes only", () => {
    expect(isoDurationToMinutes("PT30M")).toBe(30);
  });

  it("parses hours and minutes", () => {
    expect(isoDurationToMinutes("PT1H30M")).toBe(90);
  });

  it("parses hours only", () => {
    expect(isoDurationToMinutes("PT2H")).toBe(120);
  });

  it("returns 0 for a malformed string rather than NaN", () => {
    expect(isoDurationToMinutes("not a duration")).toBe(0);
  });

  it("returns 0 for an empty string", () => {
    expect(isoDurationToMinutes("")).toBe(0);
  });

  // The regex only captures the PT (time) portion, not the P (date) portion, so a
  // day component is silently ignored. Pinned here so a future fix is deliberate.
  it("does not parse the day component of P1D", () => {
    expect(isoDurationToMinutes("P1D")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("drops the 0m suffix for an exact-hour duration", () => {
    expect(formatDuration("PT2H")).toBe("2h");
  });

  it("keeps minutes when there's a remainder", () => {
    expect(formatDuration("PT1H30M")).toBe("1h 30m");
  });

  it("formats sub-hour durations as N min", () => {
    expect(formatDuration("PT45M")).toBe("45 min");
  });

  it("formats a malformed duration as 0 min", () => {
    expect(formatDuration("garbage")).toBe("0 min");
  });
});

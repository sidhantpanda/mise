import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 200));
    expect(result.current).toBe("initial");
  });

  it("only updates after the value has stopped changing for `delay` ms", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: "a" },
    });

    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a"); // not yet — still within the debounce window

    rerender({ value: "abc" }); // resets the timer
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a"); // still not settled since "abc" reset the clock

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("abc");
  });
});

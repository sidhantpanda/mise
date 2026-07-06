import { useEffect, useState } from "react";

// Returns a copy of `value` that only updates after it has stopped changing for
// `delay` ms. Used to avoid firing a search request on every keystroke.
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

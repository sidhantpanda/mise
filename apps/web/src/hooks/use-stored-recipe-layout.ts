import { useCallback, useSyncExternalStore } from "react";
import { isRecipeLayout, RecipeLayout } from "@/components/recipes/recipe-layout";

// Same-tab subscribers; the `storage` event only fires in *other* tabs.
const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable, so a choice still applies this session.
const memory = new Map<string, RecipeLayout>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLayout(key: string): RecipeLayout {
  try {
    const saved = window.localStorage.getItem(key);
    return isRecipeLayout(saved) ? saved : RecipeLayout.Grid;
  } catch {
    return memory.get(key) ?? RecipeLayout.Grid;
  }
}

// A recipe layout preference persisted in localStorage. The server snapshot is
// the default (Grid), so SSR markup and the first client render agree; React then
// re-renders with the stored value after hydration.
export function useStoredRecipeLayout(key: string): [RecipeLayout, (next: RecipeLayout) => void] {
  const layout = useSyncExternalStore(
    subscribe,
    () => readLayout(key),
    () => RecipeLayout.Grid,
  );

  const setLayout = useCallback(
    (next: RecipeLayout) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage unavailable (private mode, quota): the in-memory fallback applies.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [layout, setLayout];
}

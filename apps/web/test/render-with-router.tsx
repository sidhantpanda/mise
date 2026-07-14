import { render } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";

// Components under test render <Link to="/recipes/$id">, which throws outside
// a router context. A one-route memory router is enough to satisfy it without
// pulling in the app's real route tree (the plan explicitly steers away from
// rendering full route components in Vitest).
export async function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute({ component: () => ui });
  const recipeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recipes/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([recipeRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

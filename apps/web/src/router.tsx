import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// `request` is only ever passed by entry-server.tsx, and only for the single
// SSR render of that one incoming request — it's never stored anywhere shared,
// so a route loader reading it from context can't leak one visitor's session
// into another's render. Client-side (entry-client.tsx) it stays undefined.
export const getRouter = (request?: Request) => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, request },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

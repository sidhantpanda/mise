import {
  createRequestHandler,
  renderRouterToString,
  RouterServer,
} from "@tanstack/react-router/ssr/server";

import { getRouter } from "./router";

// Renders the full <!DOCTYPE html> document for the given request as a string.
// TanStack Router's createRequestHandler sets up memory history from the
// request URL, loads matching routes, and dehydrates router/query state (which
// the <Scripts /> in __root.tsx serializes into the document for hydration).
export async function render(request: Request): Promise<string> {
  const handler = createRequestHandler({ createRouter: () => getRouter(request), request });

  const response = await handler(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  );

  return response.text();
}

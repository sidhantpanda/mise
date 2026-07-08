import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { renderErrorPage } from "./src/lib/error-page";

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);
const root = path.dirname(fileURLToPath(import.meta.url));

type RenderFn = (request: Request) => Promise<string>;

// The API's internal address for SSR loaders' self-fetches (priming data like a
// recipe's page title). This must be a loopback-reachable origin, never the
// public Host header: behind a reverse proxy that Host is the external domain,
// and looping back out through it fails on networks without NAT hairpinning. The
// API front door is pinned to port 3000 in the container (see apps/server start
// script); SERVER_URL overrides it. Resolved here — not in the SSR bundle —
// because Vite constant-folds process.env at build time, so the bundle can't
// read it at runtime.
const INTERNAL_API_ORIGIN = process.env.SERVER_URL ?? "http://localhost:3000";

// Build a standard web Request from the incoming express request so it can be
// handed to TanStack Router's createRequestHandler.
function toWebRequest(req: express.Request): Request {
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }
  // Set after copying client headers so an inbound request can't spoof it.
  headers.set("x-internal-api-origin", INTERNAL_API_ORIGIN);
  return new Request(url, { method: req.method, headers });
}

// Insert the client entry module script just before </body> so the SSR'd
// document hydrates. In dev this is the source file (Vite serves it); in prod
// it's the hashed chunk resolved from the client build manifest.
function injectClientEntry(html: string, src: string): string {
  return html.replace("</body>", `<script type="module" src="${src}"></script></body>`);
}

// In dev, Vite + @vitejs/plugin-react inject the HMR client and the React
// Fast Refresh preamble via transformIndexHtml. We can't run that over the full
// SSR'd document — parse5 chokes on TanStack's serialized dehydration scripts
// (null chars / stream-barrier markers). Instead, transform a tiny stub and
// splice only what Vite injects into <head> onto the real document.
async function devHeadInjection(vite: import("vite").ViteDevServer, url: string): Promise<string> {
  const transformed = await vite.transformIndexHtml(url, "<html><head></head><body></body></html>");
  return transformed.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
}

async function createServer() {
  const app = express();

  let vite: import("vite").ViteDevServer | undefined;
  let prodEntrySrc = "";

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root,
      appType: "custom",
      server: { middlewareMode: true },
    });
    app.use(vite.middlewares);
  } else {
    const compression = (await import("compression")).default;
    const sirv = (await import("sirv")).default;
    app.use(compression());

    app.use(
      "/assets",
      sirv(path.resolve(root, "dist/client/assets"), {
        immutable: true,
        maxAge: 31536000,
      }),
    );
    app.use(sirv(path.resolve(root, "dist/client"), { extensions: [] }));

    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(root, "dist/client/.vite/manifest.json"), "utf-8"),
    ) as Record<string, { file: string }>;
    prodEntrySrc = `/${manifest["src/entry-client.tsx"].file}`;
  }

  app.use(/.*/, async (req, res) => {
    try {
      let render: RenderFn;
      let entrySrc: string;

      if (!isProd && vite) {
        render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render as RenderFn;
        entrySrc = "/src/entry-client.tsx";
      } else {
        // Non-literal specifier: this is the SSR build artifact, which doesn't
        // exist at typecheck time, so we avoid TS statically resolving it.
        const serverEntry = "./dist/server/entry-server.js";
        render = (await import(serverEntry)).render as RenderFn;
        entrySrc = prodEntrySrc;
      }

      let html = await render(toWebRequest(req));
      if (!isProd && vite) {
        const headInjection = await devHeadInjection(vite, req.originalUrl);
        if (headInjection) html = html.replace("</head>", `${headInjection}</head>`);
      }
      html = injectClientEntry(html, entrySrc);

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite?.ssrFixStacktrace(error as Error);
      console.error(error);
      res.status(500).set({ "Content-Type": "text/html" }).end(renderErrorPage());
    }
  });

  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });

  // Close the HTTP server and Vite (its file watchers / ws server otherwise keep
  // the event loop alive) so `tsx watch` can restart without force-killing us.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await vite?.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

createServer();

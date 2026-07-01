import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { createApiApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

async function main() {
  const app = await createApiApp();

  // The API is the single front door on SERVER_PORT in both dev and prod: it
  // serves `/api` itself (createApiApp's not-found is scoped to `/api`) and
  // proxies every other request to the web server — SSR documents, static
  // assets, and in dev the Vite modules and HMR websocket. This keeps one entry
  // point and one origin, with no proxy config needed in Vite.
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  const proxy = createProxyMiddleware({
    target: process.env.WEB_URL ?? "http://localhost:4000",
    ws: true,
  });
  app.use(proxy);
  const onUpgrade: (req: IncomingMessage, socket: Socket, head: Buffer) => void = proxy.upgrade;

  const server = app.listen(env.SERVER_PORT, () => {
    console.log(`API listening on http://localhost:${env.SERVER_PORT}`);
  });
  server.on("upgrade", onUpgrade);

  // Close the HTTP server and Prisma's connection pool on signal, otherwise the
  // open handles keep the process alive and `tsx watch` has to force-kill it.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

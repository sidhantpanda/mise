import "./types.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./env.js";
import { ensureDatabase } from "./startup/ensureDatabase.js";
import { ensureSearch } from "./startup/ensureSearch.js";
import {
  oauthProtectedResource,
  requireAuth,
  requireHousehold,
  requireSessionAuth,
} from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { accessTokensRouter } from "./routes/accessTokens.js";
import { householdsRouter } from "./routes/households.js";
import { invitationsRouter } from "./routes/invitations.js";
import { recipesRouter } from "./routes/recipes.js";
import { publicLibraryRouter } from "./routes/publicLibrary.js";
import { oauthRouter, wellKnownRouter } from "./routes/oauth.js";
import { mealsRouter } from "./routes/meals.js";
import { shoppingRouter } from "./routes/shopping.js";
import { pantryRouter } from "./routes/pantry.js";
import { householdRouter } from "./routes/household.js";
import { handleMcpRequest } from "./mcp/handler.js";
import { createOpenApiDocument, swaggerHtml } from "./openapi.js";

// Builds the API Express app after bootstrapping the database. Every route is
// namespaced under `/api`, and the terminal not-found handler is scoped to
// `/api` too — so any non-API request falls through to the caller's next
// middleware. That lets this app be mounted inside the web SSR server to share a
// single port in production, while still running standalone (see index.ts) in dev.
export async function createApiApp(): Promise<express.Express> {
  await ensureDatabase();
  await ensureSearch();

  const app = express();

  // Two CORS policies. The web app is a credentialed same-origin caller, so it gets a
  // strict allowlist. The MCP endpoint and the OAuth machinery in front of it are
  // consumed by third-party clients (claude.ai, chatgpt.com) from origins we can't
  // enumerate — they authenticate with a Bearer token rather than cookies, so an open,
  // credential-less policy is safe there and is what makes browser-based MCP clients
  // work at all. `WWW-Authenticate` must be exposed or the client can't read the
  // challenge that starts the OAuth flow.
  const appCors = cors({ origin: env.WEB_ORIGIN, credentials: true });
  const publicCors = cors({
    origin: true,
    credentials: false,
    exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
    allowedHeaders: ["Authorization", "Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"],
  });
  const isPublicEndpoint = (path: string) =>
    path === "/mcp" ||
    path.startsWith("/.well-known/") ||
    /^\/oauth\/(token|register|revoke)$/.test(path);
  app.use((req, res, next) => (isPublicEndpoint(req.path) ? publicCors : appCors)(req, res, next));

  app.use(express.json());
  // OAuth clients post form-encoded bodies to /oauth/token and /oauth/register, and
  // the consent screen is a plain HTML form.
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/openapi.json", (req, res) => res.json(createOpenApiDocument(req)));
  app.get("/api/docs", (_req, res) => res.type("html").send(swaggerHtml()));

  app.use("/api/auth/tokens", requireAuth, requireSessionAuth, accessTokensRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/households", requireAuth, requireSessionAuth, householdsRouter);
  app.use("/api/invitations", requireAuth, requireSessionAuth, invitationsRouter);
  app.use("/api/recipes", requireAuth, requireHousehold, recipesRouter);
  app.use("/api/public-library", requireAuth, requireHousehold, publicLibraryRouter);
  app.use("/api/meals", requireAuth, requireHousehold, mealsRouter);
  app.use("/api/shopping", requireAuth, requireHousehold, shoppingRouter);
  app.use("/api/pantry", requireAuth, requireHousehold, pantryRouter);
  app.use("/api/household", requireAuth, requireHousehold, requireSessionAuth, householdRouter);

  // OAuth 2.1 authorization server: discovery documents, dynamic client registration,
  // and the authorize/token/revoke endpoints that let an MCP client offer a one-click
  // "Connect to Mise" button. All public — /oauth/authorize authenticates the user with
  // the normal session cookie. See docs/mcp.md.
  app.use("/.well-known", wellKnownRouter);
  app.use("/oauth", oauthRouter);

  // Model Context Protocol endpoint (Streamable HTTP). Authenticated with the same
  // Bearer access tokens as the REST API — issued either by the OAuth flow above or
  // created by hand in settings; per-tool scope is enforced inside the MCP server.
  // Lets LLM clients (Claude, ChatGPT) act on a household — e.g. "send this recipe to
  // Mise". oauthProtectedResource makes its 401 advertise where to authenticate.
  app.all("/mcp", oauthProtectedResource, requireAuth, requireHousehold, handleMcpRequest);

  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}

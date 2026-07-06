import "./types.js";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./env.js";
import { ensureDatabase } from "./startup/ensureDatabase.js";
import { ensureSearch } from "./startup/ensureSearch.js";
import { requireAuth, requireHousehold, requireSessionAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { accessTokensRouter } from "./routes/accessTokens.js";
import { householdsRouter } from "./routes/households.js";
import { invitationsRouter } from "./routes/invitations.js";
import { recipesRouter } from "./routes/recipes.js";
import { publicLibraryRouter } from "./routes/publicLibrary.js";
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
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json());
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

  // Model Context Protocol endpoint (Streamable HTTP). Authenticated with the same
  // Bearer access tokens as the REST API; per-tool scope is enforced inside the MCP
  // server. Lets LLM clients (Claude, ChatGPT) act on a household — e.g. "send this
  // recipe to Mise". See docs/mcp.md.
  app.all("/mcp", requireAuth, requireHousehold, handleMcpRequest);

  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}

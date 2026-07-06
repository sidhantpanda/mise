import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "./server.js";

// Live Streamable HTTP transports keyed by MCP session id. A session is opened by
// an `initialize` request and reused by later requests that echo the assigned
// `mcp-session-id` header — the lifecycle real MCP clients (Claude, ChatGPT) drive.
const transports = new Map<string, StreamableHTTPServerTransport>();

// Express handler for the MCP endpoint. requireAuth + requireHousehold have already
// authenticated every request (including ones that reuse a session), so the caller
// context is always trustworthy here.
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.get("mcp-session-id");
  const existing = sessionId ? transports.get(sessionId) : undefined;

  if (existing) {
    await existing.handleRequest(req as unknown as IncomingMessage, res, req.body);
    return;
  }

  // No session yet: only an `initialize` request may open one.
  if (sessionId || !isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No valid MCP session. Send an initialize request first." },
      id: null,
    });
    return;
  }

  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  const server = buildMcpServer({
    userId: req.user!.id,
    householdId: req.user!.householdId,
    scopes: req.auth?.scopes ?? [],
  });
  await server.connect(transport);
  await transport.handleRequest(req as unknown as IncomingMessage, res, req.body);
}

import type { IncomingMessage } from "node:http";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./server.js";

// Express handler for the MCP endpoint (Streamable HTTP).
//
// Stateless: every request builds its own transport + server and tears it down when
// the response ends. Mise exposes only request/response tools — no server-initiated
// notifications — so a long-lived session buys us nothing, while going stateless
// means no in-process session map to lose on restart, no affinity requirement across
// replicas, and no dependence on the client reusing a session id (ChatGPT's
// connector, in particular, doesn't).
//
// requireAuth + requireHousehold have already authenticated the caller, so the
// context handed to the tools is always trustworthy.
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
  });

  // A read-only account loses "write" here regardless of what its token carries,
  // which also demotes tokens minted before the account was flagged.
  const scopes = req.auth?.scopes ?? [];
  const server = buildMcpServer({
    userId: req.user!.id,
    householdId: req.user!.householdId,
    scopes: req.user!.isReadOnly ? scopes.filter((s) => s !== "write") : scopes,
    tokenId: req.auth?.tokenId,
  });

  await server.connect(transport);
  await transport.handleRequest(req as unknown as IncomingMessage, res, req.body);
}

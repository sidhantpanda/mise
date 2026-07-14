import type { Express } from "express";
import type { Response as SupertestResponse } from "supertest";

// The Streamable HTTP transport answers a stateless POST either as a single JSON
// body or as one `text/event-stream` frame, depending on what the client
// negotiated — parse whichever one comes back into the JSON-RPC envelope.
export function parseMcpResponse(res: SupertestResponse): {
  result?: { content: { type: string; text: string }[]; isError?: boolean; tools?: unknown[] };
  error?: { code: number; message: string };
} {
  const contentType = res.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    return res.body;
  }
  const text = typeof res.text === "string" ? res.text : (res.body as Buffer).toString("utf8");
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) throw new Error(`Could not find an SSE data line in MCP response: ${text}`);
  return JSON.parse(dataLine.slice("data:".length).trim());
}

export function toolText(parsed: ReturnType<typeof parseMcpResponse>): string {
  return parsed.result?.content?.map((c) => c.text).join("\n") ?? "";
}

// Shared JSON-RPC plumbing for files that split off from mcp.test.ts — every
// caller still supplies its own `app` (via getApp()) so each test file keeps its
// own beforeAll-built Express instance.
export async function callMcpTool(
  app: Express,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number } & ReturnType<typeof parseMcpResponse>> {
  const request = (await import("supertest")).default;
  const res = await request(app)
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return { status: res.status, ...parseMcpResponse(res) };
}

export async function listMcpTools(
  app: Express,
  token: string,
): Promise<ReturnType<typeof parseMcpResponse>> {
  const request = (await import("supertest")).default;
  const res = await request(app)
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  return parseMcpResponse(res);
}

// JSON tool results are always `ok(JSON.stringify(value, null, 2))` — parse that
// payload instead of asserting on the human-readable text.
export function toolJson<T = unknown>(parsed: ReturnType<typeof parseMcpResponse>): T {
  return JSON.parse(toolText(parsed)) as T;
}

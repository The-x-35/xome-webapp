"use client";

/** MCP client — JSON-RPC 2.0 to an MCP server via the /api/mcp proxy.
 *  Port of mcp_client.dart: initialize → notifications/initialized → tools/list
 *  / tools/call. The proxy returns the Mcp-Session-Id so we can keep a session. */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface RpcEnvelope {
  status: number;
  sessionId: string | null;
  result: { result?: unknown; error?: { message?: string } } | null;
}

export class McpClient {
  private id = 0;
  sessionId: string | null = null;

  constructor(
    private url: string,
    private bearerToken?: string | null,
  ) {}

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: this.url,
        bearerToken: this.bearerToken ?? undefined,
        sessionId: this.sessionId ?? undefined,
        rpc: { jsonrpc: "2.0", id: ++this.id, method, params },
      }),
    });
    const env = (await res.json()) as RpcEnvelope & { error?: string };
    if (env.sessionId) this.sessionId = env.sessionId;
    if ((env as { error?: string }).error) throw new Error((env as { error?: string }).error);
    const body = env.result;
    if (body?.error) throw new Error(body.error.message ?? "MCP error");
    return body?.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: this.url,
        bearerToken: this.bearerToken ?? undefined,
        sessionId: this.sessionId ?? undefined,
        rpc: { jsonrpc: "2.0", method, params },
      }),
    });
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Xome", version: "0.1.0" },
    });
    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const r = (await this.rpc("tools/list")) as { tools?: McpTool[] } | undefined;
    return r?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.rpc("tools/call", { name, arguments: args });
  }
}

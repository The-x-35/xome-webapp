"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { McpClient } from "./mcp-client";
import { listMcpServers } from "@/lib/store/mcp";
import type { McpServerRecord } from "@/lib/store/db";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Build agent Tools from all enabled MCP servers' cached tool lists. Names are
 *  prefixed mcp_<server>_<tool> to avoid collisions (mirrors the app). */
export async function buildMcpTools(): Promise<Tool[]> {
  let servers: McpServerRecord[] = [];
  try {
    servers = (await listMcpServers()).filter((s) => s.enabled);
  } catch {
    return [];
  }
  const tools: Tool[] = [];
  for (const server of servers) {
    const client = new McpClient(server.url, server.bearerToken);
    client.sessionId = null;
    for (const t of server.tools ?? []) {
      const prefixed = `mcp_${slug(server.name)}_${t.name}`;
      tools.push(
        defineTool({
          name: prefixed,
          description: `[${server.name}] ${t.description ?? t.name}`,
          parameterSchema:
            (t.inputSchema as { type: "object"; properties: Record<string, unknown> }) ?? {
              type: "object",
              properties: {},
              additionalProperties: true,
            },
          consent: ConsentLevel.alwaysAsk,
          group: `MCP · ${server.name}`,
          invoke: async (args) => {
            try {
              const fresh = new McpClient(server.url, server.bearerToken);
              await fresh.initialize();
              const result = await fresh.callTool(t.name, args);
              return { ok: true, result } as Record<string, unknown>;
            } catch (e) {
              return { error: "mcp_call_failed", message: String(e) };
            }
          },
        }),
      );
    }
  }
  return tools;
}

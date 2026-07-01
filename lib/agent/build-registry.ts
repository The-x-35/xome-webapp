"use client";

import { ToolRegistry } from "./tools/registry";
import { builtinTools } from "./tools/builtin";
import { memoryTools } from "./tools/memory";
import { webTools } from "@/lib/integrations/web/web-tools";
import { deviceTools } from "@/lib/integrations/device/device-tools";
import { buildMcpTools } from "@/lib/integrations/mcp/mcp-tools";
import { buildIntegrationTools } from "@/lib/integrations/registry";

/**
 * Assemble the full tool registry for a turn. Always includes builtins, memory,
 * web/info utilities, browser device tools, the enabled OAuth integrations'
 * tools, and any enabled MCP servers' tools. The orchestrator further filters
 * by `integrationId` against the enabled set, but we also skip building clients
 * for integrations the user hasn't switched on.
 */
export async function buildRegistry(enabledIntegrations: Set<string>): Promise<ToolRegistry> {
  const reg = new ToolRegistry();
  reg.registerAll(builtinTools);
  reg.registerAll(memoryTools);
  reg.registerAll(webTools);
  reg.registerAll(deviceTools);

  // OAuth integration tools (gmail, calendar, slack, notion, github).
  try {
    reg.registerAll(await buildIntegrationTools(enabledIntegrations));
  } catch {
    /* integration module not ready / not connected — skip */
  }

  // MCP servers.
  try {
    reg.registerAll(await buildMcpTools());
  } catch {
    /* no servers */
  }

  return reg;
}

import type { Tool, ToolResult } from "./tool";

/** Port of lib/agent/tools/tool_registry.dart. */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    // Last registration wins (MCP tools can re-register on reconnect).
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: Iterable<Tool>): void {
    for (const t of tools) this.register(t);
  }

  unregisterWhere(pred: (t: Tool) => boolean): void {
    for (const [name, t] of this.tools) if (pred(t)) this.tools.delete(name);
  }

  all(): Tool[] {
    return [...this.tools.values()];
  }

  byName(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Tools exposed to the model this turn — drop tools whose integration is off. */
  toolsFor(enabledIntegrations: Set<string>): Tool[] {
    return this.all().filter((t) => {
      const id = t.integrationId;
      if (id && !enabledIntegrations.has(id)) return false;
      return true;
    });
  }

  async invoke(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.byName(name);
    if (!tool) {
      return { error: "unknown_tool", message: `No tool registered with name "${name}".` };
    }
    try {
      return await tool.invoke(args);
    } catch (e) {
      return { error: "tool_threw", message: e instanceof Error ? e.message : String(e) };
    }
  }
}

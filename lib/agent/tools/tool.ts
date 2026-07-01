import { ConsentLevel } from "./consent";

/** JSON-Schema-ish object describing a tool's parameters. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** Tool results are arbitrary JSON-able objects. By convention a failure
 *  carries `error` (machine code) and `message` (human text); the orchestrator
 *  reads those defensively. */
export type ToolResult = Record<string, unknown>;

export type ToolInvoke = (args: Record<string, unknown>) => Promise<ToolResult>;

/** Port of lib/agent/tools/tool.dart. */
export interface Tool {
  name: string;
  description: string;
  parameterSchema: JsonSchema;
  consent: ConsentLevel;
  invoke: ToolInvoke;
  /** null for builtins; "gmail" | "calendar" | … gates exposure by enabled set. */
  integrationId?: string | null;
  /** UI grouping label for the tools sheet. */
  group?: string;
}

export function defineTool(t: Tool): Tool {
  return t;
}

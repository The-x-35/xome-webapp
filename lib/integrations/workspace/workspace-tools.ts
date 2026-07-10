"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { listDir, readFileText, writeFileText, searchWorkspace, workspaceName } from "./workspace-bridge";

const GROUP = "Local folder";

/** Agent-on-your-files tools. Reads are free; writes always show the approval
 *  sheet. Everything is scoped to the folder the user explicitly picked. */
export const workspaceTools: Tool[] = [
  defineTool({
    name: "workspace_list_files",
    description:
      "List files and folders in the user's connected workspace folder. path is relative (empty = root). Use this to explore before reading or writing.",
    parameterSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative folder path. Empty for root." } },
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: GROUP,
    invoke: async (args) => {
      try {
        const entries = await listDir(String(args.path ?? ""));
        return { folder: await workspaceName(), entries };
      } catch (e) {
        return { error: "workspace_failed", message: String(e instanceof Error ? e.message : e) };
      }
    },
  }),

  defineTool({
    name: "workspace_read_file",
    description: "Read a text file from the connected workspace folder (relative path). Returns up to ~24k characters.",
    parameterSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative file path, e.g. notes/todo.md" } },
      required: ["path"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: GROUP,
    invoke: async (args) => {
      try {
        return await readFileText(String(args.path ?? ""));
      } catch (e) {
        return { error: "read_failed", message: String(e instanceof Error ? e.message : e) };
      }
    },
  }),

  defineTool({
    name: "workspace_search",
    description: "Search the connected workspace folder for files/folders whose NAME contains the query (recursive, bounded).",
    parameterSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Name fragment to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: GROUP,
    invoke: async (args) => {
      try {
        const results = await searchWorkspace(String(args.query ?? ""));
        return { results };
      } catch (e) {
        return { error: "search_failed", message: String(e instanceof Error ? e.message : e) };
      }
    },
  }),

  defineTool({
    name: "workspace_write_file",
    description:
      "Write (create or overwrite) a text file in the connected workspace folder. ALWAYS shows an approval sheet. Use a relative path; parent folders are created.",
    parameterSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path, e.g. reports/summary.md" },
        content: { type: "string", description: "Full file content to write." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    group: GROUP,
    invoke: async (args) => {
      try {
        return await writeFileText(String(args.path ?? ""), String(args.content ?? ""));
      } catch (e) {
        return { error: "write_failed", message: String(e instanceof Error ? e.message : e) };
      }
    },
  }),
];

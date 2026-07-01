"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { notion } from "./notion-client";

/** Notion integration tools — backed by NotionClient (internal integration
 *  token, no OAuth). Reads are preApproved; writes are alwaysAsk. */

const GROUP = "Notion";
const INTEGRATION_ID = "notion";

function clampPageSize(value: unknown): number {
  const n = Number(value ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}

export const notionTools: Tool[] = [
  defineTool({
    name: "notion_search",
    description:
      "Search Notion pages and databases shared with the integration. Returns a compact list of {id, object, title, url}.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for." },
        pageSize: { type: "integer", description: "Max results 1-100 (default 20)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const query = String(args.query ?? "").trim();
        if (!query) return { error: "empty_query", message: "query is required" };
        const results = await notion.search(query, clampPageSize(args.pageSize));
        return { count: results.length, results };
      } catch (e) {
        return { error: "notion_search_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "notion_get_page",
    description: "Fetch a single Notion page by its ID, including its properties.",
    parameterSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The Notion page ID." },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const pageId = String(args.pageId ?? "").trim();
        if (!pageId) return { error: "empty_page_id", message: "pageId is required" };
        return await notion.getPage(pageId);
      } catch (e) {
        return { error: "notion_get_page_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "notion_create_page",
    description:
      "Create a new Notion page under a parent page or database. Optional markdown body supports paragraphs, headings (#, ##, ###), and bullet lists (- ) only — no nested or complex blocks. Set isDatabase true when the parent is a database. Returns {id, url}.",
    parameterSchema: {
      type: "object",
      properties: {
        parentId: { type: "string", description: "Parent page ID, or database ID if isDatabase is true." },
        title: { type: "string", description: "Title for the new page." },
        markdown: {
          type: "string",
          description: "Optional body. Paragraphs, headings, and bullet lists only (no nested complex blocks).",
        },
        isDatabase: { type: "boolean", description: "True if parentId is a database (default false)." },
      },
      required: ["parentId", "title"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const parentId = String(args.parentId ?? "").trim();
        const title = String(args.title ?? "").trim();
        if (!parentId) return { error: "empty_parent_id", message: "parentId is required" };
        if (!title) return { error: "empty_title", message: "title is required" };
        const markdown = args.markdown == null ? undefined : String(args.markdown);
        const isDatabase = Boolean(args.isDatabase ?? false);
        return await notion.createPage({ parentId, title, markdown, isDatabase });
      } catch (e) {
        return { error: "notion_create_page_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "notion_update_page",
    description:
      "Update the properties of an existing Notion page. Pass a Notion `properties` object. Returns {id}.",
    parameterSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The Notion page ID to update." },
        properties: { type: "object", description: "Notion properties object to set." },
      },
      required: ["pageId", "properties"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const pageId = String(args.pageId ?? "").trim();
        if (!pageId) return { error: "empty_page_id", message: "pageId is required" };
        const properties = args.properties;
        if (properties == null || typeof properties !== "object") {
          return { error: "invalid_properties", message: "properties object is required" };
        }
        return await notion.updatePage({
          pageId,
          properties: properties as Record<string, unknown>,
        });
      } catch (e) {
        return { error: "notion_update_page_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "notion_list_databases",
    description:
      "List Notion databases shared with the integration. Returns a compact list of {id, title, url}.",
    parameterSchema: {
      type: "object",
      properties: {
        pageSize: { type: "integer", description: "Max results 1-100 (default 20)." },
      },
      required: [],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const databases = await notion.listDatabases(clampPageSize(args.pageSize));
        return { count: databases.length, databases };
      } catch (e) {
        return { error: "notion_list_databases_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "notion_query_database",
    description: "Query the rows (pages) of a Notion database by its ID. Returns matching rows.",
    parameterSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string", description: "The Notion database ID." },
        pageSize: { type: "integer", description: "Max rows 1-100 (default 20)." },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const databaseId = String(args.databaseId ?? "").trim();
        if (!databaseId) return { error: "empty_database_id", message: "databaseId is required" };
        const rows = await notion.queryDatabase(databaseId, clampPageSize(args.pageSize));
        return { count: rows.length, rows };
      } catch (e) {
        return { error: "notion_query_database_failed", message: String(e) };
      }
    },
  }),
];

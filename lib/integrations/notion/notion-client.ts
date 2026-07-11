"use client";

import { proxyFetch } from "@/lib/net/proxy";
import { getNotionToken } from "@/lib/store/secrets";

/**
 * NotionClient, talks to the Notion REST API (https://api.notion.com/v1) via
 * the integration proxy. Auth uses an INTERNAL INTEGRATION TOKEN pasted by the
 * user (no OAuth), read per-call from getNotionToken(). Notion is on the proxy
 * allowlist so we call proxyFetch directly.
 */

const BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionSearchHit {
  id: string;
  object: string;
  title: string;
  url: string;
}

export interface NotionDatabaseHit {
  id: string;
  title: string;
  url: string;
}

export interface CreatePageArgs {
  parentId: string;
  title: string;
  markdown?: string;
  isDatabase?: boolean;
}

export interface UpdatePageArgs {
  pageId: string;
  properties: Record<string, unknown>;
}

type NotionBlock = Record<string, unknown>;

/** Minimal title extractor: pulls plain text from a `title`-typed property. */
function extractTitle(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  for (const value of Object.values(props)) {
    const prop = value as { type?: string; title?: Array<{ plain_text?: string }> };
    if (prop && prop.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map((t) => t.plain_text ?? "").join("");
    }
  }
  return "";
}

/**
 * Tiny markdown → Notion blocks converter. Supports, one block per line:
 *  - `# ` / `## ` / `### ` headings
 *  - `- ` bullet list items
 *  - everything else → paragraph
 * Blank lines are skipped. No nested or complex blocks.
 */
function markdownToBlocks(markdown: string): NotionBlock[] {
  const rich = (content: string) => [{ type: "text", text: { content } }];
  const blocks: NotionBlock[] = [];
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "") continue;
    if (line.startsWith("### ")) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: rich(line.slice(4)) } });
    } else if (line.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: rich(line.slice(3)) } });
    } else if (line.startsWith("# ")) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: rich(line.slice(2)) } });
    } else if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: rich(line.slice(2)) },
      });
    } else {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: rich(line) } });
    }
  }
  return blocks;
}

export class NotionClient {
  private async token(): Promise<string> {
    const token = await getNotionToken();
    if (!token) {
      throw new Error(
        "Notion is not connected. Paste an internal integration token in Connections.",
      );
    }
    return token;
  }

  private async request<T = unknown>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.token();
    const res = await proxyFetch({
      url: `${BASE}${path}`,
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "content-type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      const err = res.json<{ message?: string; code?: string }>();
      throw new Error(err.message ?? `Notion request failed (${res.status}).`);
    }
    return res.json<T>();
  }

  async search(query: string, pageSize = 20): Promise<NotionSearchHit[]> {
    const data = await this.request<{
      results?: Array<{
        id: string;
        object: string;
        url?: string;
        properties?: Record<string, unknown>;
      }>;
    }>("/search", "POST", { query, page_size: pageSize });
    return (data.results ?? []).map((r) => ({
      id: r.id,
      object: r.object,
      title: extractTitle(r.properties),
      url: r.url ?? "",
    }));
  }

  async getPage(pageId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/pages/${pageId}`, "GET");
  }

  async createPage(args: CreatePageArgs): Promise<{ id: string; url: string }> {
    const { parentId, title, markdown, isDatabase = false } = args;
    const parent = isDatabase
      ? { database_id: parentId }
      : { page_id: parentId };
    const body: Record<string, unknown> = {
      parent,
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
    };
    if (markdown && markdown.trim() !== "") {
      body.children = markdownToBlocks(markdown);
    }
    const data = await this.request<{ id: string; url?: string }>("/pages", "POST", body);
    return { id: data.id, url: data.url ?? "" };
  }

  async updatePage(args: UpdatePageArgs): Promise<{ id: string }> {
    const data = await this.request<{ id: string }>(`/pages/${args.pageId}`, "PATCH", {
      properties: args.properties,
    });
    return { id: data.id };
  }

  async listDatabases(pageSize = 20): Promise<NotionDatabaseHit[]> {
    const data = await this.request<{
      results?: Array<{
        id: string;
        url?: string;
        title?: Array<{ plain_text?: string }>;
      }>;
    }>("/search", "POST", {
      query: "",
      filter: { value: "database", property: "object" },
      page_size: pageSize,
    });
    return (data.results ?? []).map((r) => ({
      id: r.id,
      title: Array.isArray(r.title) ? r.title.map((t) => t.plain_text ?? "").join("") : "",
      url: r.url ?? "",
    }));
  }

  async queryDatabase(databaseId: string, pageSize = 20): Promise<unknown[]> {
    const data = await this.request<{ results?: unknown[] }>(
      `/databases/${databaseId}/query`,
      "POST",
      { page_size: pageSize },
    );
    return data.results ?? [];
  }
}

export const notion = new NotionClient();

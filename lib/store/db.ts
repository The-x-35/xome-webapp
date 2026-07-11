"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Local-first persistence. The web analogue of the app's Hive boxes +
 * flutter_secure_storage. Everything lives in the browser's IndexedDB, which is
 * origin-isolated; nothing here is sent to a Xome server. Cloud calls only ever
 * go out through the stateless proxy when the user invokes a cloud provider or
 * a connected integration.
 *
 * Stores:
 *  - conversations : chat history (full message arrays, local-first)
 *  - memory        : single editable memory.md document
 *  - secrets       : API keys + OAuth tokens + Notion token, keyed by id
 *  - mcpServers    : configured MCP servers (+ discovered tool cache)
 *  - automations   : background automation definitions
 *  - audit         : automation run audit log
 */

import type { StoredMessage } from "@/lib/agent/chat-message";

export interface ConversationRecord {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Workspace this task belongs to (undefined = the default workspace). */
  workspaceId?: string;
  /** Hidden from the sidebar, kept in History (non-destructive). */
  archived?: boolean;
  /** Cumulative token usage across turns (cloud providers). */
  usage?: { input: number; output: number };
  /** Optional per-conversation provider/model override. */
  providerOverride?: string | null;
  modelOverride?: string | null;
}

export interface SecretRecord {
  /** e.g. "apikey.anthropic", "oauth.gmail", "notion.token", "apikey.tavily" */
  id: string;
  value: string;
  /** Optional metadata (account email, scopes, expiry) for OAuth tokens. */
  meta?: Record<string, unknown>;
  updatedAt: number;
}

export interface McpServerRecord {
  id: string;
  name: string;
  url: string;
  bearerToken?: string | null;
  enabled: boolean;
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  status?: "ok" | "error" | "unknown";
  lastError?: string | null;
  updatedAt: number;
}

export interface AutomationRecord {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: "gmail_new_match" | "slack_mention" | "github_issue_assigned" | "time_of_day";
  triggerConfig: Record<string, unknown>;
  instruction: string;
  /** Integrations this automation is pre-approved to write to. */
  allowedWrites: string[];
  provider: string;
  /** Last time the in-tab scheduler executed this automation. */
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuditRecord {
  id: string;
  automationId: string;
  ranAt: number;
  trigger: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
  outcome: string;
}

/** A user-authored skill (SKILL.md-compatible: frontmatter + markdown body).
 *  Matched skills are injected into the system prompt for the turn. */
export interface SkillRecord {
  id: string;
  /** Slug-like name, also the /slash-command ("meeting-notes"). */
  name: string;
  /** One-line description; also used for lexical matching. */
  description: string;
  /** Explicit trigger phrases that activate the skill. */
  triggers: string[];
  /** Markdown instructions injected when the skill activates. */
  content: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface XomeDB extends DBSchema {
  conversations: { key: string; value: ConversationRecord; indexes: { updatedAt: number } };
  memory: { key: string; value: { id: string; content: string; updatedAt: number } };
  secrets: { key: string; value: SecretRecord };
  mcpServers: { key: string; value: McpServerRecord };
  automations: { key: string; value: AutomationRecord };
  audit: { key: string; value: AuditRecord; indexes: { automationId: string } };
  skills: { key: string; value: SkillRecord };
  /** Persisted FileSystem handles (workspace folder). Structured-cloneable. */
  handles: { key: string; value: { id: string; handle: FileSystemDirectoryHandle; name: string } };
  /** Project workspaces, group tasks/conversations. */
  workspaces: { key: string; value: WorkspaceRecord };
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

let dbp: Promise<IDBPDatabase<XomeDB>> | null = null;

export function db(): Promise<IDBPDatabase<XomeDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on the server"));
  }
  if (!dbp) {
    dbp = openDB<XomeDB>("xome", 4, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const conv = d.createObjectStore("conversations", { keyPath: "id" });
          conv.createIndex("updatedAt", "updatedAt");
          d.createObjectStore("memory", { keyPath: "id" });
          d.createObjectStore("secrets", { keyPath: "id" });
          d.createObjectStore("mcpServers", { keyPath: "id" });
          d.createObjectStore("automations", { keyPath: "id" });
          const audit = d.createObjectStore("audit", { keyPath: "id" });
          audit.createIndex("automationId", "automationId");
        }
        if (oldVersion < 2) {
          d.createObjectStore("skills", { keyPath: "id" });
        }
        if (oldVersion < 3) {
          d.createObjectStore("handles", { keyPath: "id" });
        }
        if (oldVersion < 4) {
          d.createObjectStore("workspaces", { keyPath: "id" });
        }
      },
      // Without these handlers a schema upgrade DEADLOCKS whenever another tab
      // still holds a connection on the old version, every store call in the
      // new tab then awaits forever. `blocking` fires in the OLD tabs: close
      // their connection so the new tab can upgrade; they reopen lazily.
      blocking() {
        void dbp?.then((d) => d.close()).catch(() => {});
        dbp = null;
      },
      terminated() {
        dbp = null;
      },
    });
  }
  return dbp;
}

export function uid(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

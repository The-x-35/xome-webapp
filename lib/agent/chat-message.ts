/**
 * Chat message model, port of lib/agent/chat_message.dart.
 *
 * A single role union covers user / assistant / tool / system. Assistant
 * messages may carry pending tool calls and provider-internal `thinking`.
 * Tool messages carry the originating call id + name and the JSON result.
 */

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** An attached image (data URL or base64 + mime), for vision-capable models. */
export interface ImageAttachment {
  mime: string;
  /** base64 without the data: prefix */
  data: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  images?: ImageAttachment[];
  /** Set when role === "tool". */
  toolName?: string;
  toolCallId?: string;
  /** Set when role === "assistant" and the turn requested tools. */
  pendingToolCalls?: PendingToolCall[];
  /** Provider-internal reasoning (Claude/Gemma thinking), kept for audit. */
  thinking?: string;
  /** UI-only: full untruncated tool result JSON for the inline tool card. */
  toolResult?: unknown;
  /** UI-only: whether a tool call failed / was declined. */
  toolStatus?: "ok" | "error" | "declined";
  createdAt: number;
}

/** Persisted form (no transient UI fields stripped, we keep them for replay). */
export type StoredMessage = ChatMessage;

export function newMessage(m: Omit<ChatMessage, "id" | "createdAt"> & Partial<Pick<ChatMessage, "id" | "createdAt">>): ChatMessage {
  return {
    id: m.id ?? Math.random().toString(36).slice(2),
    createdAt: m.createdAt ?? Date.now(),
    ...m,
  };
}

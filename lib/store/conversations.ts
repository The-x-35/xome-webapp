"use client";

import { db, uid, type ConversationRecord } from "./db";
import type { ChatMessage } from "@/lib/agent/chat-message";

export async function listConversations(): Promise<ConversationRecord[]> {
  const all = await (await db()).getAll("conversations");
  return all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getConversation(id: string): Promise<ConversationRecord | undefined> {
  return (await db()).get("conversations", id);
}

export async function createConversation(first?: ChatMessage): Promise<ConversationRecord> {
  const now = Date.now();
  const rec: ConversationRecord = {
    id: uid(),
    title: "New chat",
    messages: first ? [first] : [],
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
  await (await db()).put("conversations", rec);
  return rec;
}

export async function saveConversation(rec: ConversationRecord): Promise<void> {
  rec.updatedAt = Date.now();
  await (await db()).put("conversations", rec);
}

export async function deleteConversation(id: string): Promise<void> {
  await (await db()).delete("conversations", id);
}

export async function clearAllConversations(): Promise<void> {
  await (await db()).clear("conversations");
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  const rec = await getConversation(id);
  if (!rec) return;
  rec.archived = archived;
  await saveConversation(rec);
}

/** Fork a conversation: copy messages up to (and including) `uptoMessageId`
 *  (or all of them) into a new conversation. */
export async function forkConversation(id: string, uptoMessageId?: string): Promise<ConversationRecord | null> {
  const src = await getConversation(id);
  if (!src) return null;
  let messages = src.messages;
  if (uptoMessageId) {
    const idx = messages.findIndex((m) => m.id === uptoMessageId);
    if (idx >= 0) messages = messages.slice(0, idx + 1);
  }
  const now = Date.now();
  const rec: ConversationRecord = {
    id: uid(),
    title: `${src.title} (fork)`.slice(0, 72),
    messages: [...messages],
    createdAt: now,
    updatedAt: now,
    pinned: false,
    providerOverride: src.providerOverride,
    modelOverride: src.modelOverride,
  };
  await (await db()).put("conversations", rec);
  return rec;
}

/** Revert: drop everything after (and optionally including) a message. */
export async function revertConversation(id: string, messageId: string, inclusive = false): Promise<void> {
  const rec = await getConversation(id);
  if (!rec) return;
  const idx = rec.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  rec.messages = rec.messages.slice(0, inclusive ? idx : idx + 1);
  await saveConversation(rec);
}

/** First user message becomes the title (trimmed to a sane length). */
export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 60 ? t.slice(0, 60) + "…" : t || "New chat";
}

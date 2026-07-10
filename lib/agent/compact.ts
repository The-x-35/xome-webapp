"use client";

import type { ChatMessage } from "./chat-message";
import { newMessage } from "./chat-message";
import type { LlmProvider } from "./providers/provider";

/** How many recent messages survive compaction verbatim. */
const KEEP_RECENT = 4;

function transcriptOf(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === "user") return `User: ${m.content}`;
      if (m.role === "assistant") return m.content ? `Assistant: ${m.content}` : "";
      if (m.role === "tool") return `[tool ${m.toolName}: ${m.content.slice(0, 300)}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Compact a long conversation: summarize everything except the most recent
 * turns into one assistant "summary" message. Ported idea from OpenWork's
 * session compaction — especially valuable for small on-device contexts.
 * Returns the new message array (summary + recent tail), or null if there is
 * not enough history to be worth compacting.
 */
export async function compactMessages(args: {
  provider: LlmProvider;
  messages: ChatMessage[];
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<ChatMessage[] | null> {
  const { provider, messages, model, apiKey, signal } = args;
  if (messages.length <= KEEP_RECENT + 2) return null;

  const toSummarize = messages.slice(0, -KEEP_RECENT);
  const tail = messages.slice(-KEEP_RECENT);

  const prompt = `Summarize this conversation so it can replace the full history as context. Capture: what the user is working on, decisions made, key facts and preferences stated, tool results worth keeping, and anything still unresolved. Be dense and factual — bullet points, no preamble.\n\n${transcriptOf(toSummarize)}`;

  let summary = "";
  for await (const ev of provider.generate({
    messages: [newMessage({ role: "user", content: prompt })],
    tools: [],
    systemPrompt: "You compress conversations into dense, factual context summaries.",
    model,
    apiKey,
    signal,
  })) {
    if (ev.kind === "text") summary += ev.text;
    if (ev.kind === "error") throw new Error(ev.message);
  }
  if (!summary.trim()) return null;

  const summaryMsg = newMessage({
    role: "assistant",
    content: `**Conversation compacted.** Earlier context, summarized:\n\n${summary.trim()}`,
  });
  return [summaryMsg, ...tail];
}

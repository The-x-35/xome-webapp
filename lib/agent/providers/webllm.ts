"use client";

import type { ChatMessage } from "../chat-message";
import { Capability, type GenerateArgs, type LlmEvent, type LlmProvider } from "./provider";
import { getLoadedEngine, loadLocalModel, currentLocalModel, resetLocalChat } from "./webllm-engine";

/** Convert to OpenAI-style chat messages (WebLLM is OpenAI-compatible). */
function convert(messages: ChatMessage[], systemPrompt?: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content || "" };
      if (m.pendingToolCalls?.length) {
        msg.tool_calls = m.pendingToolCalls.map((tc) => ({
          id: tc.id, type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

export const webllmProvider: LlmProvider = {
  id: "webllm",
  displayName: "On-device",
  capabilities: new Set([Capability.text, Capability.functionCalling]),
  models: [],
  defaultModel: null,
  isLocal: true,

  async resetConversation() {
    await resetLocalChat();
  },

  async warmup(model?: string) {
    if (model) await loadLocalModel(model);
  },

  async *generate({ messages, tools, systemPrompt, model, options, signal }: GenerateArgs): AsyncGenerator<LlmEvent> {
    // Ensure the requested model is loaded (no-op if already current).
    let engine = await getLoadedEngine();
    const want = model || currentLocalModel();
    if (!engine || (want && currentLocalModel() !== want)) {
      if (!want) {
        yield { kind: "error", message: "No local model loaded. Pick one in Settings → On-device model." };
        return;
      }
      engine = await loadLocalModel(want);
    }
    if (!engine) {
      yield { kind: "error", message: "Local model engine unavailable." };
      return;
    }

    const req: Record<string, unknown> = {
      messages: convert(messages, systemPrompt),
      stream: true,
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
    };
    if (tools.length) {
      req.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameterSchema },
      }));
      req.tool_choice = "auto";
    }

    let asyncChunks: AsyncIterable<Record<string, unknown>>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      asyncChunks = (await (engine as any).chat.completions.create(req)) as AsyncIterable<Record<string, unknown>>;
    } catch (e) {
      yield { kind: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    const calls = new Map<number, { id: string; name: string; args: string }>();
    let emittedTool = false;
    try {
      for await (const chunk of asyncChunks) {
        if (signal?.aborted) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          try { await (engine as any).interruptGenerate?.(); } catch { /* ignore */ }
          break;
        }
        const choice = (chunk.choices as Array<Record<string, unknown>>)?.[0];
        const delta = choice?.delta as Record<string, unknown> | undefined;
        if (delta?.content) yield { kind: "text", text: delta.content as string };
        const tcs = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
        if (tcs) {
          for (const tc of tcs) {
            const idx = (tc.index as number) ?? 0;
            const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id as string;
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn?.name) cur.name = fn.name as string;
            if (fn?.arguments) cur.args += fn.arguments as string;
            calls.set(idx, cur);
          }
        }
      }
    } catch (e) {
      yield { kind: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    for (const c of calls.values()) {
      if (!c.name) continue;
      let parsed: Record<string, unknown> = {};
      try { parsed = c.args ? JSON.parse(c.args) : {}; } catch { /* keep {} */ }
      yield { kind: "tool_call", id: c.id || crypto.randomUUID(), name: c.name, args: parsed };
      emittedTool = true;
    }
    yield { kind: "turn_end", reason: emittedTool ? "tool" : "stop" };
  },
};

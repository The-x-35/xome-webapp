import type { ChatMessage } from "../chat-message";
import type { Tool } from "../tools/tool";
import { Capability, type GenerateArgs, type LlmEvent, type LlmProvider } from "./provider";
import { readSSE } from "./sse";

const MODELS = [
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-opus-4-1",
  "claude-haiku-4-5",
];

/** Fable 5 and Opus 4.7+ reject sampling params (400). */
const NO_TEMPERATURE = /^claude-(fable|mythos)-|^claude-opus-4-[78]/;

function convertMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "system") continue; // sent via `system`
    if (m.role === "user") {
      const content: Array<Record<string, unknown>> = [];
      for (const img of m.images ?? [])
        content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.data } });
      content.push({ type: "text", text: m.content || "" });
      out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.pendingToolCalls ?? [])
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      out.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
      });
    }
  }
  return out;
}

function convertTools(tools: Tool[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameterSchema }));
}

export const anthropicProvider: LlmProvider = {
  id: "anthropic",
  displayName: "Claude",
  capabilities: new Set([Capability.text, Capability.vision, Capability.functionCalling, Capability.thinking]),
  models: MODELS,
  defaultModel: "claude-sonnet-4-6",
  isLocal: false,

  async *generate({ messages, tools, systemPrompt, model, options, apiKey, signal }: GenerateArgs): AsyncGenerator<LlmEvent> {
    const m = model || "claude-sonnet-4-6";
    const body: Record<string, unknown> = {
      model: m,
      max_tokens: options?.maxOutputTokens ?? 4096,
      stream: true,
      messages: convertMessages(messages),
    };
    if (!NO_TEMPERATURE.test(m)) body.temperature = options?.temperature ?? 0.7;
    if (systemPrompt) body.system = systemPrompt;
    if (tools.length) body.tools = convertTools(tools);

    const res = await fetch("/api/llm/anthropic", {
      method: "POST",
      headers: { "content-type": "application/json", "x-xome-key": apiKey ?? "" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => res.statusText);
      yield { kind: "error", message: `Claude: ${res.status} ${msg.slice(0, 300)}` };
      return;
    }

    // Accumulate tool_use blocks by content-block index.
    const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
    for await (const frame of readSSE(res.body, signal)) {
      if (frame.data === "[DONE]") break;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(frame.data); } catch { continue; }
      const type = evt.type as string;

      if (type === "content_block_start") {
        const idx = evt.index as number;
        const cb = evt.content_block as Record<string, unknown>;
        blocks.set(idx, { type: cb.type as string, id: cb.id as string, name: cb.name as string, json: "" });
      } else if (type === "content_block_delta") {
        const idx = evt.index as number;
        const delta = evt.delta as Record<string, unknown>;
        if (delta.type === "text_delta") yield { kind: "text", text: delta.text as string };
        else if (delta.type === "thinking_delta") yield { kind: "thinking", text: (delta.thinking as string) ?? "" };
        else if (delta.type === "input_json_delta") {
          const b = blocks.get(idx);
          if (b) b.json += (delta.partial_json as string) ?? "";
        }
      } else if (type === "content_block_stop") {
        const idx = evt.index as number;
        const b = blocks.get(idx);
        if (b && b.type === "tool_use" && b.id && b.name) {
          let parsed: Record<string, unknown> = {};
          try { parsed = b.json ? JSON.parse(b.json) : {}; } catch { /* keep {} */ }
          yield { kind: "tool_call", id: b.id, name: b.name, args: parsed };
        }
      } else if (type === "message_start") {
        const usage = (evt.message as Record<string, unknown>)?.usage as Record<string, number> | undefined;
        if (usage?.input_tokens) yield { kind: "usage", inputTokens: usage.input_tokens, outputTokens: 0 };
      } else if (type === "message_delta") {
        const usage = evt.usage as Record<string, number> | undefined;
        if (usage?.output_tokens) yield { kind: "usage", inputTokens: 0, outputTokens: usage.output_tokens };
      } else if (type === "message_stop") {
        yield { kind: "turn_end", reason: "stop" };
      } else if (type === "error") {
        yield { kind: "error", message: String((evt.error as Record<string, unknown>)?.message ?? "stream error") };
      }
    }
  },
};

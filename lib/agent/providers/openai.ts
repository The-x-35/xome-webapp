import type { ChatMessage } from "../chat-message";
import type { Tool } from "../tools/tool";
import { Capability, type GenerateArgs, type LlmEvent, type LlmProvider } from "./provider";
import { readSSE } from "./sse";

const MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"];

function convertMessages(messages: ChatMessage[], systemPrompt?: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      if (m.images?.length) {
        const content: Array<Record<string, unknown>> = [{ type: "text", text: m.content || "" }];
        for (const img of m.images)
          content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data}` } });
        out.push({ role: "user", content });
      } else {
        out.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant" };
      if (m.content) msg.content = m.content;
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

export const openaiProvider: LlmProvider = {
  id: "openai",
  displayName: "GPT",
  capabilities: new Set([Capability.text, Capability.vision, Capability.functionCalling]),
  models: MODELS,
  defaultModel: "gpt-5.4-mini",
  isLocal: false,

  async *generate({ messages, tools, systemPrompt, model, options, apiKey, signal }: GenerateArgs): AsyncGenerator<LlmEvent> {
    const m = model || "gpt-5.4-mini";
    const isGpt5 = m.startsWith("gpt-5");
    const body: Record<string, unknown> = {
      model: m,
      stream: true,
      messages: convertMessages(messages, systemPrompt),
    };
    // gpt-5* reject custom temperature and rename the token limit param.
    if (!isGpt5) {
      body.temperature = options?.temperature ?? 0.7;
      if (options?.maxOutputTokens) body.max_tokens = options.maxOutputTokens;
    } else if (options?.maxOutputTokens) {
      body.max_completion_tokens = options.maxOutputTokens;
    }
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameterSchema },
      }));
    }

    const res = await fetch("/api/llm/openai", {
      method: "POST",
      headers: { "content-type": "application/json", "x-xome-key": apiKey ?? "" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => res.statusText);
      yield { kind: "error", message: `GPT: ${res.status} ${msg.slice(0, 300)}` };
      return;
    }

    // Accumulate tool calls by index.
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let emittedTool = false;
    for await (const frame of readSSE(res.body, signal)) {
      if (frame.data === "[DONE]") break;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(frame.data); } catch { continue; }
      const choice = (evt.choices as Array<Record<string, unknown>>)?.[0];
      if (!choice) continue;
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (delta?.content) yield { kind: "text", text: delta.content as string };
      const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
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
    // Flush accumulated tool calls at stream end.
    for (const c of calls.values()) {
      let parsed: Record<string, unknown> = {};
      try { parsed = c.args ? JSON.parse(c.args) : {}; } catch { /* keep {} */ }
      yield { kind: "tool_call", id: c.id || crypto.randomUUID(), name: c.name, args: parsed };
      emittedTool = true;
    }
    yield { kind: "turn_end", reason: emittedTool ? "tool" : "stop" };
  },
};

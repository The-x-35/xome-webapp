import type { ChatMessage } from "../chat-message";
import type { Tool } from "../tools/tool";
import { Capability, type GenerateArgs, type LlmEvent, type LlmProvider } from "./provider";
import { readSSE } from "./sse";

const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

function convertMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      const parts: Array<Record<string, unknown>> = [];
      for (const img of m.images ?? [])
        parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
      parts.push({ text: m.content || "" });
      out.push({ role: "user", parts });
    } else if (m.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.pendingToolCalls ?? [])
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      out.push({ role: "model", parts });
    } else if (m.role === "tool") {
      let response: unknown = m.content;
      try { response = JSON.parse(m.content); } catch { /* keep string */ }
      out.push({ role: "function", parts: [{ functionResponse: { name: m.toolName, response } }] });
    }
  }
  return out;
}

export const googleProvider: LlmProvider = {
  id: "google",
  displayName: "Gemini",
  capabilities: new Set([Capability.text, Capability.vision, Capability.functionCalling]),
  models: MODELS,
  defaultModel: "gemini-2.5-flash",
  isLocal: false,

  async *generate({ messages, tools, systemPrompt, model, options, apiKey, signal }: GenerateArgs): AsyncGenerator<LlmEvent> {
    const m = model || "gemini-2.5-flash";
    const body: Record<string, unknown> = {
      contents: convertMessages(messages),
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        ...(options?.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
      },
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    if (tools.length) {
      body.tools = [{
        functionDeclarations: tools.map((t) => ({
          name: t.name, description: t.description, parameters: t.parameterSchema,
        })),
      }];
    }

    const res = await fetch(`/api/llm/google?model=${encodeURIComponent(m)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-xome-key": apiKey ?? "" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => res.statusText);
      yield { kind: "error", message: `Gemini: ${res.status} ${msg.slice(0, 300)}` };
      return;
    }

    let emittedTool = false;
    for await (const frame of readSSE(res.body, signal)) {
      if (frame.data === "[DONE]") break;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(frame.data); } catch { continue; }
      const cand = (evt.candidates as Array<Record<string, unknown>>)?.[0];
      const parts = ((cand?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>) ?? [];
      for (const part of parts) {
        if (typeof part.text === "string") yield { kind: "text", text: part.text };
        const fc = part.functionCall as Record<string, unknown> | undefined;
        if (fc) {
          yield {
            kind: "tool_call",
            id: crypto.randomUUID(),
            name: fc.name as string,
            args: (fc.args as Record<string, unknown>) ?? {},
          };
          emittedTool = true;
        }
      }
    }
    yield { kind: "turn_end", reason: emittedTool ? "tool" : "stop" };
  },
};

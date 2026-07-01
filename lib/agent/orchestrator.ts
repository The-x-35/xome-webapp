import type { ChatMessage, ImageAttachment, PendingToolCall } from "./chat-message";
import { newMessage } from "./chat-message";
import type { ToolRegistry } from "./tools/registry";
import { ConsentLevel, type ApprovalGate } from "./tools/consent";
import { selectRelevantTools } from "./tools/selector";
import { buildSystemPrompt } from "./system-prompt";
import { Capability, type LlmProvider, type GenerationOptions } from "./providers/provider";

const MAX_ITERATIONS = 6;
const TOOL_RESULT_LIMIT = 4000;

/** UI events emitted by the loop for the chat screen to render. */
export type UiEvent =
  | { kind: "assistant_delta"; text: string }
  | { kind: "thinking_delta"; text: string }
  | { kind: "assistant_message"; message: ChatMessage }
  | { kind: "tool_started"; callId: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_finished"; callId: string; name: string; result: Record<string, unknown> }
  | { kind: "tool_failed"; callId: string; name: string; message: string }
  | { kind: "tool_declined"; callId: string; name: string }
  | { kind: "tool_message"; message: ChatMessage }
  | { kind: "error"; message: string }
  | { kind: "turn_ended"; reason: string };

export interface RunArgs {
  provider: LlmProvider;
  registry: ToolRegistry;
  history: ChatMessage[];
  userInput: string;
  images?: ImageAttachment[];
  userFirstName?: string | null;
  model?: string;
  apiKey?: string;
  options?: GenerationOptions;
  enabledIntegrations: Set<string>;
  activeIntegrationAccounts: Record<string, string | null>;
  modelSupportsFunctionCalling?: boolean;
  memory?: string | null;
  gate: ApprovalGate;
  signal?: AbortSignal;
  /** Persist callback fired for every message appended (user/assistant/tool). */
  onAppendMessage: (m: ChatMessage) => void;
}

/**
 * The agent loop — port of lib/agent/orchestrator.dart.
 * Plan → call provider → execute tools (with approval) → reflect → repeat,
 * capped at 6 iterations. Yields UiEvents; mutates nothing the caller owns.
 */
export async function* runOrchestrator(args: RunArgs): AsyncGenerator<UiEvent> {
  const {
    provider, registry, history, userInput, images, userFirstName, model, apiKey,
    options, enabledIntegrations, activeIntegrationAccounts, memory, gate, signal,
    onAppendMessage,
  } = args;

  const sessionApproved = new Set<string>();
  const messages: ChatMessage[] = [...history];

  const userMsg = newMessage({ role: "user", content: userInput, images });
  messages.push(userMsg);
  onAppendMessage(userMsg);

  const supportsFc =
    provider.capabilities.has(Capability.functionCalling) &&
    (args.modelSupportsFunctionCalling ?? true);

  const candidates = supportsFc ? registry.toolsFor(enabledIntegrations) : [];
  // Local models get a lexically pre-filtered subset; cloud models get all.
  const tools = provider.isLocal
    ? selectRelevantTools(userInput, candidates)
    : candidates;

  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (signal?.aborted) {
      yield { kind: "turn_ended", reason: "aborted" };
      return;
    }

    const systemPrompt = buildSystemPrompt({
      tools,
      userFirstName,
      activeIntegrations: activeIntegrationAccounts,
      memory,
      inlineToolList: provider.isLocal && !supportsFc,
    });

    let assistantText = "";
    let thinkingText = "";
    const pending: PendingToolCall[] = [];
    let errored = false;

    try {
      for await (const ev of provider.generate({
        messages, tools, systemPrompt, model, options, apiKey, signal,
      })) {
        switch (ev.kind) {
          case "text":
            assistantText += ev.text;
            yield { kind: "assistant_delta", text: ev.text };
            break;
          case "thinking":
            thinkingText += ev.text;
            yield { kind: "thinking_delta", text: ev.text };
            break;
          case "tool_call":
            pending.push({ id: ev.id, name: ev.name, args: ev.args });
            break;
          case "error":
            yield { kind: "error", message: ev.message };
            errored = true;
            break;
          case "turn_end":
            break;
        }
        if (errored) break;
      }
    } catch (e) {
      if (signal?.aborted) {
        yield { kind: "turn_ended", reason: "aborted" };
        return;
      }
      yield { kind: "error", message: e instanceof Error ? e.message : String(e) };
      errored = true;
    }

    if (errored) {
      yield { kind: "turn_ended", reason: "error" };
      return;
    }

    const assistantMsg = newMessage({
      role: "assistant",
      content: assistantText,
      pendingToolCalls: pending.length ? pending : undefined,
      thinking: thinkingText || undefined,
    });
    messages.push(assistantMsg);
    yield { kind: "assistant_message", message: assistantMsg };
    onAppendMessage(assistantMsg);

    if (pending.length === 0) {
      yield { kind: "turn_ended", reason: "stop" };
      return;
    }

    // ── Dispatch tool calls ──
    for (const call of pending) {
      const tool = registry.byName(call.name);
      if (!tool) {
        yield { kind: "tool_failed", callId: call.id, name: call.name, message: "Unknown tool" };
        const tm = newMessage({
          role: "tool", toolName: call.name, toolCallId: call.id,
          content: JSON.stringify({ error: "unknown_tool" }),
          toolStatus: "error",
        });
        messages.push(tm);
        onAppendMessage(tm);
        continue;
      }

      let approved =
        tool.consent === ConsentLevel.preApproved ||
        (tool.consent === ConsentLevel.askOncePerSession && sessionApproved.has(tool.name));

      if (!approved) {
        const resp = await gate({
          toolName: tool.name, description: tool.description, args: call.args, consent: tool.consent,
        });
        approved = resp.approved;
        if (resp.approved && resp.rememberForSession && tool.consent === ConsentLevel.askOncePerSession) {
          sessionApproved.add(tool.name);
        }
      }

      if (!approved) {
        yield { kind: "tool_declined", callId: call.id, name: call.name };
        const tm = newMessage({
          role: "tool", toolName: call.name, toolCallId: call.id,
          content: JSON.stringify({ error: "declined_by_user" }),
          toolStatus: "declined",
        });
        messages.push(tm);
        onAppendMessage(tm);
        continue;
      }

      yield { kind: "tool_started", callId: call.id, name: call.name, args: call.args };
      const result = await registry.invoke(call.name, call.args);
      const ok = result.error == null;
      if (ok) {
        yield { kind: "tool_finished", callId: call.id, name: call.name, result };
      } else {
        yield {
          kind: "tool_failed", callId: call.id, name: call.name,
          message: String(result.message ?? result.error),
        };
      }

      const full = JSON.stringify(result);
      const llmFacing = full.length > TOOL_RESULT_LIMIT ? full.slice(0, TOOL_RESULT_LIMIT) + "…" : full;
      const toolMsg = newMessage({
        role: "tool", toolName: call.name, toolCallId: call.id,
        content: llmFacing, toolResult: result, toolStatus: ok ? "ok" : "error",
      });
      messages.push(toolMsg);
      yield { kind: "tool_message", message: toolMsg };
      onAppendMessage(toolMsg);
    }
    // loop: feed tool results back to the provider
  }

  yield { kind: "error", message: `Tool-call loop exceeded ${MAX_ITERATIONS} iterations.` };
  yield { kind: "turn_ended", reason: "error" };
}

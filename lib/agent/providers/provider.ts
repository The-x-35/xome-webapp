import type { ChatMessage } from "../chat-message";
import type { Tool } from "../tools/tool";

/** Port of lib/agent/providers/llm_provider.dart. */

export enum Capability {
  text = "text",
  vision = "vision",
  audio = "audio",
  functionCalling = "functionCalling",
  thinking = "thinking",
}

export type FinishReason = "stop" | "length" | "tool" | "error";

/** Streaming events — sealed union (TextDelta | ThinkingDelta | ToolCall | TurnEnd | ProviderError). */
export type LlmEvent =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "usage"; inputTokens: number; outputTokens: number }
  | { kind: "turn_end"; reason: FinishReason }
  | { kind: "error"; message: string; retriable?: boolean };

export interface GenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  topK?: number;
  topP?: number;
}

export interface GenerateArgs {
  messages: ChatMessage[];
  tools: Tool[];
  systemPrompt?: string;
  model?: string;
  options?: GenerationOptions;
  signal?: AbortSignal;
  /** API key / token, supplied per-call (never stored server-side). */
  apiKey?: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: Set<Capability>;
  readonly models: string[];
  readonly defaultModel: string | null;
  /** True if this provider runs entirely in the browser (no key needed). */
  readonly isLocal: boolean;
  generate(args: GenerateArgs): AsyncGenerator<LlmEvent>;
  /** Optional: reset KV cache (local model between conversations). */
  resetConversation?(): Promise<void>;
  warmup?(model?: string): Promise<void>;
}

export function hasCapability(p: LlmProvider, c: Capability): boolean {
  return p.capabilities.has(c);
}

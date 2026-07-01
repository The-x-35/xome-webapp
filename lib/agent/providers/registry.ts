import type { LlmProvider } from "./provider";
import { webllmProvider } from "./webllm";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { googleProvider } from "./google";
import type { ProviderId as PrefProviderId } from "@/lib/store/prefs";

export const PROVIDERS: Record<PrefProviderId, LlmProvider> = {
  webllm: webllmProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
};

export function getProvider(id: PrefProviderId): LlmProvider {
  return PROVIDERS[id] ?? webllmProvider;
}

/** Cloud providers need a key; the local one runs free in the browser. */
export const CLOUD_PROVIDERS: PrefProviderId[] = ["anthropic", "openai", "google"];

export const PROVIDER_LABELS: Record<PrefProviderId, string> = {
  webllm: "On-device",
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};

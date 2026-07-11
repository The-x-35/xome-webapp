/**
 * Curated local-model catalog, the web analogue of assets/models.json.
 * Every `id` is a real WebLLM prebuilt model id (verified against
 * @mlc-ai/web-llm 0.2.x prebuiltAppConfig). `supportsFunctionCalling` gates
 * whether the orchestrator exposes tools to the model (mirrors the app rule
 * that sub-3B models often fail at JSON tool output).
 */

export interface LocalModel {
  id: string;
  name: string;
  /** Approx download size, human label. */
  size: string;
  /** Approx VRAM/RAM needed. */
  vram: string;
  description: string;
  supportsFunctionCalling: boolean;
  recommended?: boolean;
  tag?: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    name: "Qwen2.5 3B Instruct",
    size: "~1.9 GB",
    vram: "~2.5 GB",
    description: "Best all-round local default. Reliable tool-calling, good reasoning, runs on most laptops with WebGPU.",
    supportsFunctionCalling: true,
    recommended: true,
    tag: "Recommended",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 1B Instruct",
    size: "~0.9 GB",
    vram: "~1.2 GB",
    description: "Tiny and fast, ideal for low-end devices or quick chat. Tool-calling is unreliable at this size, so it runs chat-only.",
    supportsFunctionCalling: false,
    tag: "Lightweight",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    name: "Qwen2.5 1.5B Instruct",
    size: "~1.1 GB",
    vram: "~1.6 GB",
    description: "A small model that still handles simple tool calls. Good middle ground for modest hardware.",
    supportsFunctionCalling: true,
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    name: "Gemma 2 2B Instruct",
    size: "~1.4 GB",
    vram: "~1.9 GB",
    description: "Google's Gemma 2, the closest cousin to the mobile app's on-device brain. Strong chat, chat-only here.",
    supportsFunctionCalling: false,
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    name: "Hermes 3 (Llama 3.2 3B)",
    size: "~2.0 GB",
    vram: "~2.6 GB",
    description: "Fine-tuned specifically for function calling. Excellent tool reliability at a moderate size.",
    supportsFunctionCalling: true,
    tag: "Best tools",
  },
  {
    id: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    name: "Qwen2.5 7B Instruct",
    size: "~4.7 GB",
    vram: "~6 GB",
    description: "The strongest local option. Near-cloud quality reasoning and tools, needs a capable GPU.",
    supportsFunctionCalling: true,
    tag: "Most capable",
  },
  {
    id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    name: "Hermes 2 Pro (Llama 3 8B)",
    size: "~5.0 GB",
    vram: "~6.5 GB",
    description: "Battle-tested function-calling model. Top-tier tool use, heaviest download.",
    supportsFunctionCalling: true,
  },
];

export function getLocalModel(id: string | null | undefined): LocalModel | undefined {
  if (!id) return undefined;
  return LOCAL_MODELS.find((m) => m.id === id);
}

export function modelSupportsFunctionCalling(id: string | null | undefined): boolean {
  return getLocalModel(id)?.supportsFunctionCalling ?? false;
}

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
  { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", name: "Hermes 3 (Llama 3.1 8B)", size: "~4.9 GB", vram: "~6.3 GB", description: "Larger Hermes 3. Excellent tool calling and reasoning on capable GPUs.", supportsFunctionCalling: true },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B Instruct", size: "~2.0 GB", vram: "~2.6 GB", description: "Meta's balanced small model. Solid chat with basic tool support.", supportsFunctionCalling: true },
  { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B Instruct", size: "~4.6 GB", vram: "~6 GB", description: "Meta's strong 8B. Near-cloud chat quality with tool calling.", supportsFunctionCalling: true },
  { id: "Qwen3-1.7B-q4f16_1-MLC", name: "Qwen3 1.7B", size: "~1.2 GB", vram: "~1.7 GB", description: "Newer Qwen generation at a small size. Quick and capable.", supportsFunctionCalling: true },
  { id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen3 4B", size: "~2.5 GB", vram: "~3.2 GB", description: "Newer Qwen generation. Strong reasoning-to-size ratio with tools.", supportsFunctionCalling: true },
  { id: "Qwen3-8B-q4f16_1-MLC", name: "Qwen3 8B", size: "~5.0 GB", vram: "~6.5 GB", description: "The strongest Qwen3 in the browser. Needs a capable GPU.", supportsFunctionCalling: true },
  { id: "Qwen3.5-2B-q4f16_1-MLC", name: "Qwen3.5 2B", size: "~1.5 GB", vram: "~2 GB", description: "Latest Qwen family at a light size.", supportsFunctionCalling: true },
  { id: "Qwen3.5-4B-q4f16_1-MLC", name: "Qwen3.5 4B", size: "~2.6 GB", vram: "~3.4 GB", description: "Latest Qwen family, balanced pick.", supportsFunctionCalling: true },
  { id: "Qwen3.5-9B-q4f16_1-MLC", name: "Qwen3.5 9B", size: "~5.4 GB", vram: "~7 GB", description: "Latest Qwen family, most capable local option.", supportsFunctionCalling: true },
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 1.5B", size: "~1.1 GB", vram: "~1.6 GB", description: "Code-tuned small model for quick programming help.", supportsFunctionCalling: false },
  { id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 7B", size: "~4.7 GB", vram: "~6 GB", description: "Strong code-tuned model for local programming work.", supportsFunctionCalling: false },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", size: "~2.3 GB", vram: "~3 GB", description: "Microsoft's compact reasoner. Great quality for its size, chat-only.", supportsFunctionCalling: false },
  { id: "Phi-4-mini-instruct-q4f16_1-MLC", name: "Phi 4 Mini", size: "~2.5 GB", vram: "~3.2 GB", description: "Microsoft's newer compact model. Sharp reasoning, chat-only.", supportsFunctionCalling: false },
  { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC", name: "Mistral 7B Instruct v0.3", size: "~4.2 GB", vram: "~5.5 GB", description: "The classic Mistral 7B. Fast, fluent chat.", supportsFunctionCalling: false },
  { id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC", name: "Hermes 2 Pro (Mistral 7B)", size: "~4.2 GB", vram: "~5.5 GB", description: "Function-calling fine-tune on Mistral 7B.", supportsFunctionCalling: true },
  { id: "gemma-2-9b-it-q4f16_1-MLC", name: "Gemma 2 9B Instruct", size: "~5.5 GB", vram: "~7 GB", description: "Google's larger Gemma 2. Excellent chat on strong hardware.", supportsFunctionCalling: false },
  { id: "gemma3-1b-it-q4f16_1-MLC", name: "Gemma 3 1B Instruct", size: "~0.9 GB", vram: "~1.2 GB", description: "Google's newest tiny Gemma. Fast, light, chat-only.", supportsFunctionCalling: false },
  { id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC", name: "DeepSeek R1 Distill (Qwen 7B)", size: "~4.7 GB", vram: "~6 GB", description: "Reasoning-distilled model that thinks before answering.", supportsFunctionCalling: false },
  { id: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC", name: "DeepSeek R1 Distill (Llama 8B)", size: "~4.9 GB", vram: "~6.3 GB", description: "Reasoning-distilled Llama variant. Strong step-by-step work.", supportsFunctionCalling: false },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", name: "SmolLM2 1.7B", size: "~1.2 GB", vram: "~1.6 GB", description: "HuggingFace's efficient small model.", supportsFunctionCalling: false },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", name: "SmolLM2 360M", size: "~0.3 GB", vram: "~0.5 GB", description: "Tiny and instant. Runs on almost anything, basic chat.", supportsFunctionCalling: false },
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 0.5B", size: "~0.5 GB", vram: "~0.7 GB", description: "Featherweight Qwen for instant replies on modest hardware.", supportsFunctionCalling: false },
  { id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC", name: "TinyLlama 1.1B", size: "~0.7 GB", vram: "~1 GB", description: "The classic tiny model. Basic chat, minimal footprint.", supportsFunctionCalling: false },
];

export function getLocalModel(id: string | null | undefined): LocalModel | undefined {
  if (!id) return undefined;
  return LOCAL_MODELS.find((m) => m.id === id);
}

export function modelSupportsFunctionCalling(id: string | null | undefined): boolean {
  return getLocalModel(id)?.supportsFunctionCalling ?? false;
}

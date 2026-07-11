"use client";

/**
 * WebLLM engine manager, the web replacement for flutter_gemma. Loads a model
 * into a singleton MLCEngine running on WebGPU, entirely in the browser. Model
 * shards are fetched once and cached by the browser (Cache API), so subsequent
 * loads are instant. Nothing here touches a Xome server.
 */

import type { MLCEngine, InitProgressReport } from "@mlc-ai/web-llm";

export type LoadProgress = { progress: number; text: string };

let enginePromise: Promise<MLCEngine> | null = null;
let loadedModelId: string | null = null;

export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function currentLocalModel(): string | null {
  return loadedModelId;
}

/** Load (or switch to) a model. Safe to call repeatedly for the same id. */
export async function loadLocalModel(
  modelId: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<MLCEngine> {
  if (!isWebGpuAvailable()) {
    throw new Error(
      "WebGPU isn't available in this browser. Use Chrome/Edge 113+ (or enable WebGPU), or add a cloud API key in Settings.",
    );
  }
  if (loadedModelId === modelId && enginePromise) return enginePromise;

  const webllm = await import("@mlc-ai/web-llm");
  const initProgressCallback = (r: InitProgressReport) =>
    onProgress?.({ progress: r.progress ?? 0, text: r.text ?? "" });

  if (enginePromise) {
    // Reload into the existing engine to reuse the WebGPU device.
    const engine = await enginePromise;
    engine.setInitProgressCallback(initProgressCallback);
    await engine.reload(modelId);
    loadedModelId = modelId;
    return engine;
  }

  enginePromise = webllm.CreateMLCEngine(modelId, { initProgressCallback });
  const engine = await enginePromise;
  loadedModelId = modelId;
  return engine;
}

export async function getLoadedEngine(): Promise<MLCEngine | null> {
  if (!enginePromise) return null;
  return enginePromise;
}

export async function resetLocalChat(): Promise<void> {
  const engine = await getLoadedEngine();
  if (engine) await engine.resetChat();
}

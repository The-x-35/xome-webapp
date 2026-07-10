"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/ui/mark";
import { Button, Tag, MetaChip } from "@/components/ui/index";
import { IconDownload, IconCheck, IconKey } from "@/components/chrome/icons";
import { LOCAL_MODELS, getLocalModel } from "@/lib/models/catalog";
import { loadLocalModel, isWebGpuAvailable, type LoadProgress } from "@/lib/agent/providers/webllm-engine";
import { PROVIDERS, PROVIDER_LABELS, CLOUD_PROVIDERS } from "@/lib/agent/providers/registry";
import { setApiKey } from "@/lib/store/secrets";
import { setPrefs, type ProviderId } from "@/lib/store/prefs";
import { cn } from "@/lib/utils";

type Mode = "cloud" | "local";
type Phase = "idle" | "loading" | "done" | "error";

const KEY_HINTS: Record<string, string> = {
  anthropic: "console.anthropic.com → API keys",
  openai: "platform.openai.com → API keys",
  google: "aistudio.google.com → Get API key",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("cloud");

  // Cloud path
  const [cloudChoice, setCloudChoice] = useState<string>(`anthropic::${PROVIDERS.anthropic.defaultModel}`);
  const [apiKey, setApiKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Local path
  const [localId, setLocalId] = useState<string>(
    (LOCAL_MODELS.find((m) => m.recommended) ?? LOCAL_MODELS[0]).id,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<LoadProgress>({ progress: 0, text: "" });
  const [error, setError] = useState<string | null>(null);
  const [webgpu, setWebgpu] = useState(true);

  useEffect(() => setWebgpu(isWebGpuAvailable()), []);

  const [cloudProvider, cloudModel] = cloudChoice.split("::") as [ProviderId, string];
  const selectedLocal = getLocalModel(localId) ?? LOCAL_MODELS[0];
  const pct = Math.round(progress.progress * 100);

  const continueCloud = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await setApiKey(cloudProvider, apiKey.trim());
      setPrefs({
        activeProvider: cloudProvider,
        models: { [cloudProvider]: cloudModel },
        onboardingComplete: true,
      });
      router.replace("/chat");
    } finally {
      setSaving(false);
    }
  };

  const installLocal = async () => {
    setPhase("loading");
    setError(null);
    try {
      await loadLocalModel(localId, setProgress);
      setPrefs({ localModelId: localId, activeProvider: "webllm", onboardingComplete: true });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const selectCls =
    "mt-1 w-full appearance-none rounded-[var(--radius-input)] border border-border bg-surface-2 px-3.5 py-3 text-[14px] text-text outline-none focus:border-accent";

  return (
    <div className="min-h-[100svh] bg-stage">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="flex items-center gap-2.5">
          <Mark size={30} className="text-ink" />
          <span className="font-display text-[20px] font-medium">Xome</span>
        </div>
        <h1 className="mt-7 font-display text-4xl font-medium tracking-[-0.02em]">Pick a brain. Start doing.</h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-text-2">
          Use a cloud model with your own API key, or run one fully on-device. You can switch anytime from the model
          menu in chat.
        </p>

        {/* Mode toggle */}
        <div className="mt-7 inline-flex rounded-[var(--radius-input)] border border-border bg-surface-2 p-1">
          {(
            [
              ["cloud", "Cloud model"],
              ["local", "On-device"],
            ] as Array<[Mode, string]>
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={phase === "loading"}
              className={cn(
                "rounded-[10px] px-4 py-2 text-[13.5px] font-medium transition",
                mode === m ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text",
              )}
            >
              {label}
              {m === "cloud" && <span className="ml-1.5 text-[11px] text-accent-text">Recommended</span>}
            </button>
          ))}
        </div>

        {/* ── Cloud path ── */}
        {mode === "cloud" && (
          <div className="mt-5 rounded-[var(--radius-card)] border border-border bg-surface p-5">
            <label className="block text-[12.5px] font-medium text-text-2">
              Model
              <select value={cloudChoice} onChange={(e) => setCloudChoice(e.target.value)} className={selectCls}>
                {CLOUD_PROVIDERS.map((p) => (
                  <optgroup key={p} label={PROVIDER_LABELS[p]}>
                    {PROVIDERS[p].models.map((m) => (
                      <option key={`${p}::${m}`} value={`${p}::${m}`}>
                        {m}
                        {m === PROVIDERS[p].defaultModel ? "  (default)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-[12.5px] font-medium text-text-2">
              {PROVIDER_LABELS[cloudProvider]} API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && continueCloud()}
                placeholder="Paste your API key"
                className="mt-1 w-full rounded-[var(--radius-input)] border border-border bg-surface-2 px-3.5 py-3 font-mono text-[13px] text-text outline-none focus:border-accent"
              />
            </label>
            <p className="mt-1.5 text-[12px] text-text-3">
              Get one at {KEY_HINTS[cloudProvider]}. The key stays in this browser and rides out per-request through a
              stateless proxy — never stored on a server.
            </p>

            <div className="mt-5 flex justify-end">
              <Button onClick={continueCloud} disabled={!apiKey.trim() || saving}>
                <IconKey width={16} height={16} /> {saving ? "Saving…" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Local path ── */}
        {mode === "local" && (
          <div className="mt-5 rounded-[var(--radius-card)] border border-border bg-surface p-5">
            {!webgpu && (
              <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
                WebGPU isn&apos;t available in this browser. Use Chrome or Edge 113+, or pick a cloud model instead.
              </div>
            )}

            <label className="block text-[12.5px] font-medium text-text-2">
              On-device model (runs in your browser via WebGPU)
              <select
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                disabled={phase === "loading"}
                className={selectCls}
              >
                {LOCAL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.size}
                    {m.supportsFunctionCalling ? " · tools" : " · chat only"}
                    {m.tag ? ` · ${m.tag}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="font-display text-[16px] font-semibold">{selectedLocal.name}</span>
                {selectedLocal.tag && <Tag kind={selectedLocal.recommended ? "primary" : "neutral"}>{selectedLocal.tag}</Tag>}
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-text-2">{selectedLocal.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <MetaChip icon={<IconDownload width={12} height={12} />}>{selectedLocal.size}</MetaChip>
                <MetaChip>{selectedLocal.vram} VRAM</MetaChip>
                <MetaChip>{selectedLocal.supportsFunctionCalling ? "tools + chat" : "chat only"}</MetaChip>
              </div>
              <p className="mt-2 text-[12px] text-text-3">
                Private, free, offline-capable. First download can take a few minutes; it&apos;s cached afterwards.
              </p>
            </div>

            <div className="mt-5">
              {phase === "idle" && (
                <div className="flex justify-end">
                  <Button onClick={installLocal} disabled={!webgpu}>
                    <IconDownload width={17} height={17} /> Download {selectedLocal.size}
                  </Button>
                </div>
              )}
              {phase === "loading" && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-[13px] text-text-2">
                    <span className="truncate">{progress.text || "Loading model…"}</span>
                    <span className="ml-3 shrink-0 font-mono">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
              {phase === "done" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-success">
                    <IconCheck width={18} height={18} /> {selectedLocal.name} is ready.
                  </span>
                  <Button onClick={() => router.replace("/chat")}>Start chatting</Button>
                </div>
              )}
              {phase === "error" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex-1 text-[13px] text-danger">{error}</span>
                  <div className="flex gap-2">
                    <Button variant="outlined" onClick={() => setMode("cloud")}>Use cloud instead</Button>
                    <Button onClick={installLocal}>Retry</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/ui/mark";
import { Card, Button, Tag, MetaChip } from "@/components/ui/index";
import { IconDownload, IconCheck, IconKey } from "@/components/chrome/icons";
import { LOCAL_MODELS, type LocalModel } from "@/lib/models/catalog";
import { loadLocalModel, isWebGpuAvailable, type LoadProgress } from "@/lib/agent/providers/webllm-engine";
import { getPrefs, setPrefs } from "@/lib/store/prefs";

type Phase = "idle" | "loading" | "done" | "error";

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<LocalModel>(LOCAL_MODELS.find((m) => m.recommended) ?? LOCAL_MODELS[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<LoadProgress>({ progress: 0, text: "" });
  const [error, setError] = useState<string | null>(null);
  const [webgpu, setWebgpu] = useState(true);

  useEffect(() => setWebgpu(isWebGpuAvailable()), []);

  const install = async () => {
    setPhase("loading");
    setError(null);
    try {
      await loadLocalModel(selected.id, setProgress);
      setPrefs({ localModelId: selected.id, activeProvider: "webllm", onboardingComplete: true });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const skipToCloud = () => {
    setPrefs({ onboardingComplete: true, activeProvider: "anthropic" });
    router.replace("/settings?focus=keys");
  };

  const pct = Math.round(progress.progress * 100);

  return (
    <div className="min-h-[100svh] bg-stage">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="flex items-center gap-2.5">
          <Mark size={30} className="text-ink" />
          <span className="font-display text-[20px] font-medium">Xome</span>
        </div>
        <h1 className="mt-7 font-display text-4xl font-medium tracking-[-0.02em]">Choose your brain.</h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-text-2">
          Xome runs a model right in your browser via WebGPU — private, free, and offline-capable. Pick one to
          download (cached after the first load), or bring your own cloud key.
        </p>

        {!webgpu && (
          <div className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
            WebGPU isn&apos;t available in this browser. Use Chrome or Edge 113+, or continue with a cloud API key below.
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3">
          {LOCAL_MODELS.map((m) => (
            <Card
              key={m.id}
              as="button"
              selected={selected.id === m.id}
              onClick={() => phase === "idle" && setSelected(m)}
              className="p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[17px] font-semibold">{m.name}</span>
                    {m.tag && <Tag kind={m.recommended ? "primary" : "neutral"}>{m.tag}</Tag>}
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-text-2">{m.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <MetaChip icon={<IconDownload width={12} height={12} />}>{m.size}</MetaChip>
                    <MetaChip>{m.vram} VRAM</MetaChip>
                    <MetaChip>{m.supportsFunctionCalling ? "tools + chat" : "chat only"}</MetaChip>
                  </div>
                </div>
                {selected.id === m.id && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-on-ink">
                    <IconCheck width={14} height={14} />
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 border-t border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto max-w-2xl px-5 py-4">
          {phase === "idle" && (
            <div className="flex items-center justify-between gap-3">
              <button onClick={skipToCloud} className="flex items-center gap-1.5 text-[13.5px] font-medium text-text-2 hover:text-text">
                <IconKey width={16} height={16} /> Use a cloud API key instead
              </button>
              <Button onClick={install} disabled={!webgpu}>
                <IconDownload width={17} height={17} /> Download {selected.name.split(" ")[0]} {selected.size}
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
              <p className="mt-2 text-[12px] text-text-3">First download can take a few minutes; it&apos;s cached after this.</p>
            </div>
          )}
          {phase === "done" && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[14px] font-medium text-success">
                <IconCheck width={18} height={18} /> {selected.name} is ready.
              </span>
              <Button onClick={() => router.replace("/chat")}>Start chatting</Button>
            </div>
          )}
          {phase === "error" && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex-1 text-[13px] text-danger">{error}</span>
              <div className="flex gap-2">
                <Button variant="outlined" onClick={skipToCloud}>Use cloud key</Button>
                <Button onClick={install}>Retry</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

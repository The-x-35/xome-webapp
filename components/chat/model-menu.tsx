"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/chrome/theme";
import { PROVIDERS, PROVIDER_LABELS } from "@/lib/agent/providers/registry";
import { LOCAL_MODELS, getLocalModel } from "@/lib/models/catalog";
import type { ProviderId } from "@/lib/store/prefs";
import { getApiKey } from "@/lib/store/secrets";
import { IconChevron, IconCheck } from "@/components/chrome/icons";
import { cn } from "@/lib/utils";

/** Compact provider/model switcher shown above the composer. */
export function ModelMenu() {
  const { prefs, update } = useTheme();
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all(["anthropic", "openai", "google"].map((p) => getApiKey(p).then((k) => [p, !!k] as const))).then(
      (entries) => setKeys(Object.fromEntries(entries)),
    );
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const activeProvider = prefs.activeProvider;
  const label = (() => {
    if (activeProvider === "webllm") {
      const m = getLocalModel(prefs.localModelId);
      return m ? m.name : "On-device · pick a model";
    }
    const model = prefs.models[activeProvider] || PROVIDERS[activeProvider].defaultModel;
    return `${PROVIDER_LABELS[activeProvider]} · ${model}`;
  })();

  const pick = (provider: ProviderId, model?: string) => {
    if (provider === "webllm") {
      update({ activeProvider: "webllm", ...(model ? { localModelId: model } : {}) });
    } else {
      update({ activeProvider: provider, models: { ...prefs.models, ...(model ? { [provider]: model } : {}) } });
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="xo-press flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text-2 hover:text-text"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="max-w-[200px] truncate">{label}</span>
        <IconChevron width={13} height={13} className={cn("transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 max-h-[60vh] w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-card)]">
          {/* On-device */}
          <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">
            On-device (WebGPU)
          </div>
          {LOCAL_MODELS.map((m) => {
            const sel = activeProvider === "webllm" && prefs.localModelId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => pick("webllm", m.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-2",
                  sel && "bg-surface-2",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{m.name}</span>
                  <span className="block text-[11.5px] text-text-3">{m.size}{m.supportsFunctionCalling ? " · tools" : " · chat only"}</span>
                </span>
                {sel && <IconCheck width={15} height={15} className="text-accent" />}
              </button>
            );
          })}

          {/* Cloud providers */}
          {(["anthropic", "openai", "google"] as ProviderId[]).map((p) => (
            <div key={p}>
              <div className="flex items-center gap-2 px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">
                {PROVIDER_LABELS[p]}
                {!keys[p] && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-text-3">no key</span>}
              </div>
              {PROVIDERS[p].models.map((model) => {
                const sel = activeProvider === p && (prefs.models[p] || PROVIDERS[p].defaultModel) === model;
                return (
                  <button
                    key={model}
                    onClick={() => pick(p, model)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left font-mono text-[12.5px] hover:bg-surface-2",
                      sel && "bg-surface-2",
                      !keys[p] && "opacity-60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-text">{model}</span>
                    {sel && <IconCheck width={15} height={15} className="text-accent" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

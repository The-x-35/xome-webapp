"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/chrome/theme";
import { Section, Row } from "@/components/settings/primitives";
import { ApiKeyDialog } from "@/components/settings/api-key-dialog";
import { Tag, Button } from "@/components/ui/index";
import { IconKey, IconTrash, IconChevron, IconCheck } from "@/components/chrome/icons";
import { getLocalModel } from "@/lib/models/catalog";
import { getApiKey } from "@/lib/store/secrets";
import { clearAllConversations } from "@/lib/store/conversations";
import { exportSetup, importSetup } from "@/lib/store/transfer";
import { emit } from "@/lib/store/bus";
import type { AccentId, ThemeMode, ProviderId } from "@/lib/store/prefs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACCENTS: { id: AccentId; color: string; name: string }[] = [
  { id: "indigo", color: "#5b57d1", name: "Indigo" },
  { id: "blue", color: "#2f6be0", name: "Blue" },
  { id: "green", color: "#2f855a", name: "Green" },
  { id: "ink", color: "#1b1a18", name: "Ink" },
  { id: "violet", color: "#9a6bd1", name: "Violet" },
];

const CLOUD: { id: ProviderId; label: string; hint: string; site: string }[] = [
  { id: "anthropic", label: "Claude", hint: "console.anthropic.com → API keys", site: "Anthropic" },
  { id: "openai", label: "GPT", hint: "platform.openai.com → API keys", site: "OpenAI" },
  { id: "google", label: "Gemini", hint: "aistudio.google.com → Get API key", site: "Google AI Studio" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { prefs, setTheme, setAccent, update } = useTheme();
  const [keyDialog, setKeyDialog] = useState<{ provider: string; label: string; hint?: string } | null>(null);
  const [keyState, setKeyState] = useState<Record<string, boolean>>({});
  const [name, setName] = useState(prefs.userName ?? "");
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const includeMemory = confirm("Include your memory.md in the export?\n\n(API keys and tokens are never exported.)");
    const bundle = await exportSetup({ includeMemory });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xome-setup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (files: FileList | null) => {
    if (!files?.[0]) return;
    try {
      const parsed = JSON.parse(await files[0].text());
      const res = await importSetup(parsed);
      setTransferMsg(`Imported ${res.skills} skills, ${res.mcp} MCP servers, ${res.automations} automations.`);
    } catch (e) {
      setTransferMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshKeys = () =>
    Promise.all(
      ["anthropic", "openai", "google", "tavily", "brave"].map((p) => getApiKey(p).then((k) => [p, !!k] as const)),
    ).then((e) => setKeyState(Object.fromEntries(e)));

  useEffect(() => {
    refreshKeys();
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") === "keys") {
      document.getElementById("active-brain")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const localModel = getLocalModel(prefs.localModelId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-7 font-display text-3xl font-medium tracking-[-0.02em]">Settings</h1>

        {/* Profile */}
        <Section title="Profile">
          <Row>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-[17px] font-semibold text-accent-text">
                {(name || "X").trim().charAt(0).toUpperCase()}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => update({ userName: name.trim() || null })}
                placeholder="Your name"
                className="flex-1 bg-transparent text-[15px] font-medium text-text outline-none placeholder:text-text-3"
              />
            </div>
          </Row>
        </Section>

        {/* Active brain */}
        <div id="active-brain" />
        <Section title="Active brain">
          <Row
            title="On-device model"
            subtitle={localModel ? `${localModel.name} · ${localModel.size}` : "No model installed"}
            right={
              <Button variant="outlined" onClick={() => router.push("/onboarding")} className="!px-4 !py-2 text-[13px]">
                {localModel ? "Change" : "Install"}
              </Button>
            }
            onClick={() => router.push("/onboarding")}
          />
          {CLOUD.map((c) => (
            <Row
              key={c.id}
              title={c.label}
              subtitle={keyState[c.id] ? "API key set" : "No key — add to enable"}
              right={
                <div className="flex items-center gap-2">
                  {keyState[c.id] && <Tag kind="success" dot>Ready</Tag>}
                  <Button
                    variant="outlined"
                    onClick={() => setKeyDialog({ provider: c.id, label: c.label, hint: c.hint })}
                    className="!px-4 !py-2 text-[13px]"
                  >
                    <IconKey width={14} height={14} /> {keyState[c.id] ? "Edit" : "Add key"}
                  </Button>
                </div>
              }
            />
          ))}
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <Row title="Theme">
            <div className="mt-3 inline-flex rounded-[var(--radius-input)] border border-border bg-surface-2 p-1">
              {(["light", "dark", "system"] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium capitalize transition",
                    prefs.theme === t ? "bg-surface text-text shadow-sm" : "text-text-2 hover:text-text",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Accent">
            <div className="mt-3 flex gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  title={a.name}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full transition",
                    prefs.accent === a.id && "ring-2 ring-offset-2 ring-offset-surface",
                  )}
                  style={{ background: a.color, boxShadow: prefs.accent === a.id ? `0 0 0 2px ${a.color}` : undefined }}
                >
                  {prefs.accent === a.id && <IconCheck width={15} height={15} className="text-white" />}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Web search */}
        <Section title="Web search">
          <Row
            title="Search provider"
            subtitle="DuckDuckGo works with no key. Add Tavily or Brave for higher-quality results."
          >
            <div className="mt-3 flex flex-wrap gap-2">
              {(["duckduckgo", "tavily", "brave"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    if (e !== "duckduckgo" && !keyState[e]) setKeyDialog({ provider: e, label: e === "tavily" ? "Tavily" : "Brave Search", hint: e === "tavily" ? "tavily.com → API key" : "brave.com/search/api" });
                    else update({ searchEngine: e });
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px] font-medium capitalize transition",
                    prefs.searchEngine === e ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface-2 text-text-2 hover:text-text",
                  )}
                >
                  {e}{e !== "duckduckgo" && !keyState[e] ? " (add key)" : ""}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Permissions */}
        {prefs.toolAllowlist.length > 0 && (
          <Section title="Permissions">
            <Row title="Always-allowed tools" subtitle="These run without an approval sheet. Remove to ask again.">
              <div className="mt-3 flex flex-wrap gap-2">
                {prefs.toolAllowlist.map((t) => (
                  <button
                    key={t}
                    onClick={() => update({ toolAllowlist: prefs.toolAllowlist.filter((x) => x !== t) })}
                    title="Remove from allowlist"
                    className="group flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[12px] text-text-2 transition hover:border-danger hover:text-danger"
                  >
                    {t}
                    <span className="text-[13px] leading-none">×</span>
                  </button>
                ))}
              </div>
            </Row>
          </Section>
        )}

        {/* More */}
        <Section title="More">
          <Row title="Skills" subtitle="Teach Xome repeatable workflows — activate by phrase or /command" right={<IconChevron width={18} height={18} className="text-text-3" />} onClick={() => router.push("/settings/skills")} />
          <Row title="Memory" subtitle="Edit what Xome durably remembers about you" right={<IconChevron width={18} height={18} className="text-text-3" />} onClick={() => router.push("/settings/memory")} />
          <Row title="Automations" subtitle="Background triggers and scheduled tasks" right={<IconChevron width={18} height={18} className="text-text-3" />} onClick={() => router.push("/automations")} />
          <Row title="Privacy" subtitle="What data leaves your browser, and when" right={<IconChevron width={18} height={18} className="text-text-3" />} onClick={() => router.push("/privacy")} />
        </Section>

        {/* Data */}
        <Section title="Data">
          <Row
            title="Move your setup"
            subtitle="Export skills, connections config, automations & prefs as JSON. Keys and tokens are never included."
            right={
              <div className="flex gap-2">
                <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => doImport(e.target.files)} />
                <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={() => importRef.current?.click()}>
                  Import
                </Button>
                <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={doExport}>
                  Export
                </Button>
              </div>
            }
          />
          {transferMsg && <p className="px-4 pb-2 text-[12.5px] text-text-2">{transferMsg}</p>}
          <Row
            title="Clear chat history"
            subtitle="Delete all conversations from this browser"
            right={
              <Button
                variant="outlined"
                className="!px-4 !py-2 text-[13px] text-danger"
                onClick={async () => {
                  if (confirm("Delete all conversations? This cannot be undone.")) {
                    await clearAllConversations();
                    emit("conversations");
                  }
                }}
              >
                <IconTrash width={14} height={14} /> Clear
              </Button>
            }
          />
        </Section>

        <p className="mt-6 text-center text-[12px] text-text-3">Xome web · v0.1 · runs in your browser</p>
      </div>

      {keyDialog && (
        <ApiKeyDialog
          provider={keyDialog.provider}
          label={keyDialog.label}
          hint={keyDialog.hint}
          onClose={async (changed) => {
            const provider = keyDialog?.provider;
            setKeyDialog(null);
            if (!changed) return;
            refreshKeys();
            // Adding a cloud key should make that provider the active brain.
            // Otherwise the chat stays on the on-device default and fails with
            // "pick a model" even though a usable key is now set.
            if (provider && CLOUD.some((c) => c.id === provider)) {
              const hasKey = await getApiKey(provider);
              if (hasKey && prefs.activeProvider !== provider) {
                update({ activeProvider: provider as ProviderId });
              }
            }
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "@/components/ui/mark";
import { useTheme } from "@/components/chrome/theme";
import {
  IconChat,
  IconHistory,
  IconHub,
  IconSettings,
  IconBolt,
  IconPlus,
  IconSun,
  IconMoon,
  IconX,
  IconCheck,
} from "@/components/chrome/icons";
import { listConversations } from "@/lib/store/conversations";
import { listSkills } from "@/lib/store/skills";
import { exportSetup } from "@/lib/store/transfer";
import {
  listWorkspaces,
  activeWorkspaceId,
  setActiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  inWorkspace,
} from "@/lib/store/workspaces";
import type { ConversationRecord, WorkspaceRecord } from "@/lib/store/db";
import { on } from "@/lib/store/bus";
import { runningIds } from "@/lib/agent/run-manager";
import { startScheduler } from "@/lib/automations/scheduler";
import { PROVIDER_LABELS } from "@/lib/agent/providers/registry";
import { Spinner } from "@/components/ui/index";
import { cn, timeAgo } from "@/lib/utils";

const NAV = [
  { href: "/chat", label: "Tasks", icon: IconChat, match: (p: string) => p === "/chat" || p.startsWith("/chat/") },
  { href: "/history", label: "History", icon: IconHistory, match: (p: string) => p.startsWith("/history") },
  { href: "/connections", label: "Integrations", icon: IconHub, match: (p: string) => p.startsWith("/connections") },
  { href: "/settings/skills", label: "Skills", icon: IconBolt, match: (p: string) => p.startsWith("/settings/skills") },
  { href: "/settings", label: "Settings", icon: IconSettings, match: (p: string) => (p.startsWith("/settings") && !p.startsWith("/settings/skills")) || p.startsWith("/automations") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, setTheme, prefs } = useTheme();
  const [convos, setConvos] = useState<ConversationRecord[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Workspaces
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [wsId, setWsId] = useState<string>("default");
  const [addingWs, setAddingWs] = useState(false);
  const [wsName, setWsName] = useState("");
  const wsBusy = useRef(false);

  useEffect(() => {
    const load = () => {
      listWorkspaces().then(setWorkspaces).catch(() => {});
      setWsId(activeWorkspaceId());
    };
    load();
    return on("workspaces", load);
  }, []);

  useEffect(() => {
    const load = () => listConversations().then((c) => setConvos(c.filter((x) => !x.archived))).catch(() => {});
    load();
    return on("conversations", load);
  }, []);

  // Counts for the workspace nav (skills, enabled integrations).
  const [skillCount, setSkillCount] = useState(0);
  useEffect(() => {
    const load = () => listSkills().then((s) => setSkillCount(s.filter((x) => x.enabled).length)).catch(() => {});
    load();
    return on("skills", load);
  }, []);
  const integrationCount = prefs.enabledIntegrations.length;

  // Background-run indicator.
  const [running, setRunning] = useState<Set<string>>(new Set());
  useEffect(() => {
    const sync = () => setRunning(runningIds());
    sync();
    return on("runs", sync);
  }, []);

  // In-tab automation scheduler.
  useEffect(() => startScheduler(), []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const wsConvos = convos.filter((c) => inWorkspace(c.workspaceId, wsId)).slice(0, 20);

  const pickWorkspace = (id: string) => {
    setActiveWorkspace(id);
    setWsId(id);
    router.push("/chat");
  };

  const addWorkspace = async () => {
    const name = wsName.trim();
    if (!name || wsBusy.current) return;
    wsBusy.current = true;
    // Clear the input before awaiting so a second Enter can't double-create.
    setWsName("");
    setAddingWs(false);
    try {
      // Watchdog: a hung IndexedDB open (blocked upgrade) must not fail silently.
      const ws = await Promise.race([
        createWorkspace(name),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Storage is locked by another Xome tab. Close other Xome tabs and try again.")), 4000),
        ),
      ]);
      pickWorkspace(ws.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      wsBusy.current = false;
    }
  };

  const shareSetup = async () => {
    const bundle = await exportSetup({ includeMemory: false });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xome-setup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sidebar = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Link href="/chat" className="flex items-center gap-2">
          <Mark size={24} className="text-ink" />
          <span className="font-display text-[19px] font-medium tracking-[-0.01em]">Xome</span>
        </Link>
        <a
          href="https://github.com/The-x-35/xome-webapp"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-3 transition hover:text-text"
        >
          open source
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Workspaces */}
        <div className="px-2 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
          Workspaces
        </div>
        {workspaces.map((w) => (
          <div key={w.id} className="group/ws relative">
            <button
              onClick={() => pickWorkspace(w.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13.5px] transition",
                wsId === w.id ? "bg-surface-2 font-medium text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", wsId === w.id ? "bg-accent" : "bg-border-strong")} />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
            </button>
            {w.id !== "default" && (
              <button
                onClick={() => {
                  if (confirm(`Delete workspace "${w.name}"? Its tasks move to Personal.`)) void deleteWorkspace(w.id);
                }}
                title="Delete workspace"
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-text-3 hover:text-danger group-hover/ws:block"
              >
                <IconX width={13} height={13} />
              </button>
            )}
          </div>
        ))}
        {addingWs ? (
          <div className="mt-1 flex items-center gap-1.5 px-2">
            <input
              autoFocus
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addWorkspace();
                if (e.key === "Escape") setAddingWs(false);
              }}
              placeholder="Workspace name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button onClick={() => void addWorkspace()} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-on-ink">
              <IconCheck width={13} height={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingWs(true)}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] text-text-3 transition hover:bg-surface-2 hover:text-text"
          >
            <IconPlus width={13} height={13} /> Add workspace
          </button>
        )}

        {/* Workspace nav */}
        <div className="px-2 pb-1 pt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
          Workspace
        </div>
        {NAV.map((n) => {
          const active = n.match(pathname);
          const Icon = n.icon;
          const count = n.label === "Skills" ? skillCount : n.label === "Integrations" ? integrationCount : null;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition",
                active ? "bg-accent-soft text-accent-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon width={17} height={17} />
              <span className="flex-1">{n.label}</span>
              {count != null && count > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-3">{count}</span>
              )}
            </Link>
          );
        })}

        {/* Recent tasks in this workspace */}
        <div className="flex items-center justify-between px-2 pb-1 pt-5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Recent tasks</span>
          <button
            onClick={() => router.push("/chat")}
            title="New task"
            className="grid h-6 w-6 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text"
          >
            <IconPlus width={13} height={13} />
          </button>
        </div>
        {wsConvos.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-text-3">No tasks yet.</p>}
        {wsConvos.map((c) => (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className={cn(
              "group flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] transition",
              activeId === c.id ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{c.pinned ? "📌 " : ""}{c.title}</span>
            {running.has(c.id) ? (
              <span className="shrink-0"><Spinner size={11} /></span>
            ) : (
              <span className="shrink-0 text-[10.5px] text-text-3 opacity-0 group-hover:opacity-100">{timeAgo(c.updatedAt)}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Trust + actions — honest about where prompts go for the active brain */}
      <div className="border-t border-border p-3">
        {prefs.activeProvider === "webllm" ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            <span className="text-[11.5px] leading-snug text-text-2">
              Running on-device — nothing leaves this browser
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="text-[11.5px] leading-snug text-text-2">
              Keys &amp; data stay in this browser — prompts go to {PROVIDER_LABELS[prefs.activeProvider]} with your key
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void shareSetup()}
            className="xo-press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[12.5px] font-semibold text-on-ink"
          >
            Share this setup
          </button>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Light mode" : "Dark mode"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-text-2 transition hover:text-text"
          >
            {isDark ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-[100svh] w-full overflow-hidden bg-stage">
      <div className="hidden md:flex">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--scrim)]" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 md:hidden">
          <button onClick={() => setMobileOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2">
            {mobileOpen ? <IconX width={20} height={20} /> : <Mark size={22} className="text-ink" />}
          </button>
          <span className="font-display text-[17px] font-medium">Xome</span>
          <button onClick={() => router.push("/chat")} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-on-ink">
            <IconPlus width={18} height={18} />
          </button>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

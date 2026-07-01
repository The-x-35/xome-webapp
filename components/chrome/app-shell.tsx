"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "@/components/ui/mark";
import { useTheme } from "@/components/chrome/theme";
import {
  IconChat,
  IconHistory,
  IconHub,
  IconSettings,
  IconPlus,
  IconSun,
  IconMoon,
  IconX,
} from "@/components/chrome/icons";
import { listConversations } from "@/lib/store/conversations";
import type { ConversationRecord } from "@/lib/store/db";
import { on } from "@/lib/store/bus";
import { cn, timeAgo } from "@/lib/utils";

const NAV = [
  { href: "/chat", label: "Chat", icon: IconChat, match: (p: string) => p === "/chat" || p.startsWith("/chat/") },
  { href: "/history", label: "History", icon: IconHistory, match: (p: string) => p.startsWith("/history") },
  { href: "/connections", label: "Connections", icon: IconHub, match: (p: string) => p.startsWith("/connections") },
  { href: "/settings", label: "Settings", icon: IconSettings, match: (p: string) => p.startsWith("/settings") || p.startsWith("/automations") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, setTheme, prefs } = useTheme();
  const [convos, setConvos] = useState<ConversationRecord[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const load = () => listConversations().then((c) => setConvos(c.slice(0, 30)));
    load();
    return on("conversations", load);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;

  const sidebar = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand + new chat */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <Link href="/chat" className="flex items-center gap-2">
          <Mark size={24} className="text-ink" />
          <span className="font-display text-[19px] font-medium tracking-[-0.01em]">Xome</span>
        </Link>
        <button
          onClick={() => router.push("/chat?new=1")}
          title="New chat"
          className="xo-press grid h-9 w-9 place-items-center rounded-full bg-ink text-on-ink"
        >
          <IconPlus width={18} height={18} />
        </button>
      </div>

      {/* Recent conversations */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
          Recent
        </div>
        {convos.length === 0 && (
          <p className="px-2 py-3 text-[13px] text-text-3">No conversations yet.</p>
        )}
        {convos.map((c) => (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className={cn(
              "group flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13.5px] transition",
              activeId === c.id ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{c.pinned ? "📌 " : ""}{c.title}</span>
            <span className="shrink-0 text-[11px] text-text-3 opacity-0 group-hover:opacity-100">
              {timeAgo(c.updatedAt)}
            </span>
          </Link>
        ))}
      </div>

      {/* Nav + theme */}
      <nav className="border-t border-border px-2 py-2">
        {NAV.map((n) => {
          const Active = n.match(pathname);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition",
                Active ? "bg-accent-soft text-accent-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon width={20} height={20} />
              {n.label}
            </Link>
          );
        })}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-text-2 transition hover:bg-surface-2 hover:text-text"
        >
          {isDark ? <IconSun width={20} height={20} /> : <IconMoon width={20} height={20} />}
          {isDark ? "Light mode" : "Dark mode"}
        </button>
      </nav>
    </aside>
  );

  return (
    <div className="flex h-[100svh] w-full overflow-hidden bg-stage">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--scrim)]" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 md:hidden">
          <button onClick={() => setMobileOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2">
            {mobileOpen ? <IconX width={20} height={20} /> : <Mark size={22} className="text-ink" />}
          </button>
          <span className="font-display text-[17px] font-medium">Xome</span>
          <button onClick={() => router.push("/chat?new=1")} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-on-ink">
            <IconPlus width={18} height={18} />
          </button>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* suppress unused warning for prefs (kept for future provider badge) */}
      <span hidden>{prefs.activeProvider}</span>
    </div>
  );
}

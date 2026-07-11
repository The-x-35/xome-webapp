"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listConversations, deleteConversation, saveConversation, setArchived, forkConversation } from "@/lib/store/conversations";
import type { ConversationRecord } from "@/lib/store/db";
import { emit, on } from "@/lib/store/bus";
import { EmptyState } from "@/components/ui/index";
import { Mark } from "@/components/ui/mark";
import { IconSearch, IconTrash, IconPin, IconChat } from "@/components/chrome/icons";
import { timeAgo, dayBucket } from "@/lib/utils";

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function HistoryPage() {
  const router = useRouter();
  const [convos, setConvos] = useState<ConversationRecord[]>([]);
  const [q, setQ] = useState("");

  const load = () => listConversations().then(setConvos);
  useEffect(() => {
    load();
    return on("conversations", load);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return convos;
    return convos.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        c.messages.some((m) => m.content.toLowerCase().includes(needle)),
    );
  }, [convos, q]);

  const groups = useMemo(() => {
    const g: Record<string, ConversationRecord[]> = { Pinned: [], Today: [], Yesterday: [], Earlier: [], Archived: [] };
    for (const c of filtered) {
      if (c.archived) g.Archived.push(c);
      else if (c.pinned) g.Pinned.push(c);
      else g[dayBucket(c.updatedAt)].push(c);
    }
    return g;
  }, [filtered]);

  const archive = async (c: ConversationRecord) => {
    await setArchived(c.id, !c.archived);
    emit("conversations");
  };

  const fork = async (c: ConversationRecord) => {
    const copy = await forkConversation(c.id);
    emit("conversations");
    if (copy) router.push(`/chat/${copy.id}`);
  };

  const togglePin = async (c: ConversationRecord) => {
    c.pinned = !c.pinned;
    await saveConversation(c);
    emit("conversations");
  };

  const remove = async (c: ConversationRecord) => {
    if (confirm(`Delete "${c.title}"?`)) {
      await deleteConversation(c.id);
      emit("conversations");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-5 font-display text-3xl font-medium tracking-[-0.02em]">History</h1>

        <div className="mb-6 flex items-center gap-2 rounded-[var(--radius-input)] border border-border bg-surface px-3.5 py-2.5">
          <IconSearch width={18} height={18} className="text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3"
          />
        </div>

        {convos.length === 0 ? (
          <EmptyState
            icon={<Mark size={56} className="text-text-3" />}
            title="No conversations yet"
            body="Start a chat and it'll show up here, searchable, pinnable, and stored only in this browser."
          />
        ) : (
          Object.entries(groups).map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label} className="mb-6">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">{label}</div>
                <div className="flex flex-col gap-2">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3.5 py-3 transition hover:border-border-strong"
                    >
                      <button onClick={() => router.push(`/chat/${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-text-3">
                          {c.pinned ? <IconPin width={18} height={18} /> : <IconChat width={18} height={18} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium text-text">{c.title}</span>
                          <span className="block truncate text-[12.5px] text-text-2">
                            {c.messages.findLast?.((m) => m.role === "assistant" || m.role === "user")?.content?.slice(0, 80) ?? `${c.messages.length} messages`}
                            {c.usage && (c.usage.input || c.usage.output) ? (
                              <span className="ml-1.5 text-text-3">· {formatTokens(c.usage.input + c.usage.output)} tokens</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11.5px] text-text-3">{timeAgo(c.updatedAt)}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => fork(c)} title="Fork conversation" className="grid h-8 w-8 place-items-center rounded-full text-[13px] text-text-3 hover:bg-surface-2 hover:text-text">
                          ⑂
                        </button>
                        <button onClick={() => archive(c)} title={c.archived ? "Unarchive" : "Archive"} className="grid h-8 w-8 place-items-center rounded-full text-[13px] text-text-3 hover:bg-surface-2 hover:text-text">
                          {c.archived ? "↩" : "🗄"}
                        </button>
                        <button onClick={() => togglePin(c)} title={c.pinned ? "Unpin" : "Pin"} className="grid h-8 w-8 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text">
                          <IconPin width={16} height={16} />
                        </button>
                        <button onClick={() => remove(c)} title="Delete" className="grid h-8 w-8 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-danger">
                          <IconTrash width={16} height={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}

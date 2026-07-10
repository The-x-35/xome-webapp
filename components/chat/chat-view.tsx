"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/lib/agent/use-chat";
import { MessageBubble, LiveAssistant, ToolRunGroup } from "./messages";
import type { ChatMessage, ImageAttachment } from "@/lib/agent/chat-message";
import { Composer } from "./composer";
import { ApprovalSheet } from "./approval-sheet";
import { StatusPill } from "@/components/ui/index";
import { Spinner } from "@/components/ui/index";
import { IconX } from "@/components/chrome/icons";
import { undoMemoryChange } from "@/lib/store/memory";
import { useTheme } from "@/components/chrome/theme";
import { integrationLabel } from "@/lib/agent/system-prompt";
import { ModelMenu } from "./model-menu";
import { IconSend } from "@/components/chrome/icons";

const STARTERS: Array<{ tag: string; text: string }> = [
  { tag: "email", text: "Summarize my unread email and list the action items" },
  { tag: "calendar", text: "What's on my calendar tomorrow?" },
  { tag: "web", text: "Search the web for the latest on WebGPU and summarize" },
  { tag: "slack", text: "Create a GitHub issue for each unread Slack mention" },
  { tag: "solana", text: "What's my SOL balance and the current price?" },
];

export function ChatView({ conversationId }: { conversationId: string | null }) {
  const { state, send, stop, resolveApproval, dismissError, compact } = useChat(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Memory-change undo toast: appears for 6s after a memory_* tool succeeds.
  const [memoryToast, setMemoryToast] = useState(false);
  const lastMemoryWrite = useRef<string | null>(null);
  useEffect(() => {
    const m = [...state.messages]
      .reverse()
      .find((x) => x.role === "tool" && x.toolName?.startsWith("memory_") && x.toolStatus === "ok");
    if (m && m.id !== lastMemoryWrite.current) {
      lastMemoryWrite.current = m.id;
      setMemoryToast(true);
      const t = setTimeout(() => setMemoryToast(false), 6000);
      return () => clearTimeout(t);
    }
  }, [state.messages]);

  // Composer commands: /compact is handled here; everything else is a message
  // (including /skill-name invocations, which use-chat resolves).
  const handleSend = useCallback(
    (text: string, images?: ImageAttachment[]) => {
      if (text.trim() === "/compact") {
        void compact();
        return;
      }
      send(text, images);
    },
    [send, compact],
  );

  // When a brand-new conversation gets its id, navigate to its real route.
  // Runs live in the module-level run manager, so the remount re-attaches to
  // the in-flight stream seamlessly — and the Next router stays in sync (a
  // bare history.replaceState here would desync usePathname and break the
  // "New task" navigation back to /chat).
  const router = useRouter();
  useEffect(() => {
    if (state.conversationId && state.conversationId !== conversationId) {
      router.replace(`/chat/${state.conversationId}`);
    }
  }, [state.conversationId, conversationId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length, state.liveText, state.statusText]);

  const empty = state.messages.length === 0 && !state.liveText;
  const { prefs } = useTheme();
  const [task, setTask] = useState("");

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: context + connected integrations + model */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-3">Tasks</span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {prefs.enabledIntegrations.slice(0, 5).map((id) => (
            <span
              key={id}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] text-text-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {integrationLabel(id)}
            </span>
          ))}
          {prefs.enabledIntegrations.length === 0 && (
            <button
              onClick={() => router.push("/connections")}
              className="shrink-0 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-text-3 hover:text-text"
            >
              + Connect your apps
            </button>
          )}
        </div>
        <ModelMenu />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-6 pb-16">
            <h1 className="font-display text-[34px] font-medium leading-tight tracking-[-0.02em]">
              What should Xome <span className="italic text-accent-text">work on</span>?
            </h1>
            <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-text-2">
              Describe an outcome. Xome plans it, uses your connected tools, and pauses for your approval before
              anything leaves your browser.
            </p>

            {/* Task box */}
            <div className="mt-7 rounded-2xl border border-border-strong bg-surface p-4 shadow-[var(--shadow-composer)] transition focus-within:border-accent">
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (task.trim()) handleSend(task);
                  }
                }}
                rows={3}
                style={{ outline: "none" }}
                placeholder="e.g. Read yesterday's meeting threads in Gmail, draft follow-ups, and post a summary to #marketing on Slack"
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-text outline-none placeholder:text-text-3"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-text-3">
                  Reads run freely · every write asks first
                </span>
                <button
                  onClick={() => task.trim() && handleSend(task)}
                  disabled={!task.trim()}
                  className={cnBtn(!!task.trim())}
                >
                  <IconSend width={15} height={15} /> Run task
                </button>
              </div>
            </div>

            {/* Tagged starters */}
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="xo-press flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-left text-[13px] text-text-2 transition hover:border-border-strong hover:text-text"
                >
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">
                    {s.tag}
                  </span>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-3 py-6">
            {groupMessages(state.messages).map((item) =>
              Array.isArray(item) ? (
                <ToolRunGroup key={item[0].id} messages={item} />
              ) : (
                <MessageBubble key={item.id} message={item} />
              ),
            )}
            {(state.liveText || (state.running && !state.statusText)) && (
              <LiveAssistant text={state.liveText} thinking={state.liveThinking} />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Status + error rail */}
      <div className="mx-auto w-full max-w-3xl px-3">
        {!state.running && state.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {state.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="xo-press rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12.5px] text-text-2 transition hover:border-accent hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {state.statusText && (
          <div className="pb-1">
            <StatusPill icon={<Spinner size={13} />}>{state.statusText}</StatusPill>
          </div>
        )}
        {state.error && (
          <div className="mb-1 flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <span className="flex-1">{state.error}</span>
            <button onClick={dismissError} className="shrink-0"><IconX width={16} height={16} /></button>
          </div>
        )}
      </div>

      {memoryToast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-[var(--shadow-card)]">
            <span className="text-[13px] text-text-2">Memory updated</span>
            <button
              onClick={async () => {
                await undoMemoryChange();
                setMemoryToast(false);
              }}
              className="text-[13px] font-semibold text-accent-text hover:underline"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {!empty && <Composer running={state.running} onSend={handleSend} onStop={stop} />}

      {state.pendingApproval && (
        <ApprovalSheet
          req={state.pendingApproval.req}
          onResolve={(approved, remember, always) => resolveApproval(approved, remember, always)}
        />
      )}
    </div>
  );
}

function cnBtn(enabled: boolean): string {
  return [
    "xo-press flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition",
    enabled ? "bg-ink text-on-ink" : "bg-surface-2 text-text-3",
  ].join(" ");
}

/** Group consecutive tool messages into one timeline block. Plan/artifact tool
 *  messages render standalone; only the latest plan_update survives (it always
 *  carries the full, current checklist). */
function groupMessages(messages: ChatMessage[]): Array<ChatMessage | ChatMessage[]> {
  const out: Array<ChatMessage | ChatMessage[]> = [];
  let planIdx = -1;
  for (const m of messages) {
    if (m.role === "tool" && m.toolName === "plan_update" && m.toolStatus === "ok") {
      if (planIdx >= 0) out.splice(planIdx, 1);
      out.push(m);
      planIdx = out.length - 1;
      continue;
    }
    if (m.role === "tool" && m.toolName === "present_artifact" && m.toolStatus === "ok") {
      out.push(m);
      continue;
    }
    const last = out[out.length - 1];
    if (m.role === "tool") {
      if (Array.isArray(last)) last.push(m);
      else out.push([m]);
    } else {
      out.push(m);
    }
  }
  return out;
}

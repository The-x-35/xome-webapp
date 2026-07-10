"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/agent/use-chat";
import { MessageBubble, LiveAssistant, ToolRunGroup } from "./messages";
import type { ChatMessage, ImageAttachment } from "@/lib/agent/chat-message";
import { Composer } from "./composer";
import { ApprovalSheet } from "./approval-sheet";
import { StatusPill } from "@/components/ui/index";
import { Mark } from "@/components/ui/mark";
import { Spinner } from "@/components/ui/index";
import { IconX } from "@/components/chrome/icons";
import { getPrefs } from "@/lib/store/prefs";
import { undoMemoryChange } from "@/lib/store/memory";

const STARTERS = [
  "Summarize my unread email and list the action items",
  "What's on my calendar tomorrow?",
  "Search the web for the latest on WebGPU and summarize",
  "Draft a reply to the most recent email from my boss",
  "Create a GitHub issue in my inbox repo for each unread Slack mention",
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

  // When a brand-new conversation gets its id, reflect it in the URL *without* a
  // Next.js navigation. A router.replace() here would remount ChatView and
  // reload the conversation from IndexedDB mid-stream, dropping the first
  // response — the classic "only replies on the second message" bug.
  useEffect(() => {
    if (state.conversationId && state.conversationId !== conversationId) {
      window.history.replaceState(null, "", `/chat/${state.conversationId}`);
    }
  }, [state.conversationId, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length, state.liveText, state.statusText]);

  const empty = state.messages.length === 0 && !state.liveText;
  const userName = getPrefs().userName?.trim().split(/\s+/)[0];

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
            <Mark size={48} className="text-ink" />
            <h1 className="mt-5 font-display text-3xl font-medium tracking-[-0.02em]">
              {userName ? `Hello, ${userName}.` : "What can I do for you?"}
            </h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-text-2">
              I run on-device or on your own model, connect to your apps, and take action with your approval.
            </p>
            <div className="mt-7 flex w-full max-w-xl flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="xo-press rounded-2xl border border-border bg-surface px-4 py-3 text-left text-[14px] text-text-2 transition hover:border-border-strong hover:text-text"
                >
                  {s}
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

      <Composer running={state.running} onSend={handleSend} onStop={stop} />

      {state.pendingApproval && (
        <ApprovalSheet
          req={state.pendingApproval.req}
          onResolve={(approved, remember, always) => resolveApproval(approved, remember, always)}
        />
      )}
    </div>
  );
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

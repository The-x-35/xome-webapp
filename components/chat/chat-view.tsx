"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/lib/agent/use-chat";
import { MessageBubble, LiveAssistant } from "./messages";
import { Composer } from "./composer";
import { ApprovalSheet } from "./approval-sheet";
import { StatusPill } from "@/components/ui/index";
import { Mark } from "@/components/ui/mark";
import { Spinner } from "@/components/ui/index";
import { IconX } from "@/components/chrome/icons";
import { getPrefs } from "@/lib/store/prefs";

const STARTERS = [
  "Summarize my unread email and list the action items",
  "What's on my calendar tomorrow?",
  "Search the web for the latest on WebGPU and summarize",
  "Draft a reply to the most recent email from my boss",
  "Create a GitHub issue in my inbox repo for each unread Slack mention",
];

export function ChatView({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const { state, send, stop, resolveApproval, dismissError } = useChat(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When a brand-new conversation gets its id, reflect it in the URL.
  useEffect(() => {
    if (state.conversationId && state.conversationId !== conversationId) {
      router.replace(`/chat/${state.conversationId}`);
    }
  }, [state.conversationId, conversationId, router]);

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
            {state.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {(state.liveText || (state.running && !state.statusText)) && (
              <LiveAssistant text={state.liveText} thinking={state.liveThinking} />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Status + error rail */}
      <div className="mx-auto w-full max-w-3xl px-3">
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

      <Composer running={state.running} onSend={send} onStop={stop} />

      {state.pendingApproval && (
        <ApprovalSheet
          req={state.pendingApproval.req}
          onResolve={(approved, remember) => resolveApproval(approved, remember)}
        />
      )}
    </div>
  );
}

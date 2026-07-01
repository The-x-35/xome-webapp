"use client";

import { useState } from "react";
import { Mark } from "@/components/ui/mark";
import { IconBolt, IconCheck, IconX, IconChevron } from "@/components/chrome/icons";
import { renderMarkdown } from "@/lib/md";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/agent/chat-message";

export function ThinkingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-text-2">
      <span>{label}</span>
      <span className="flex gap-1">
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            className="h-[6px] w-[6px] rounded-full bg-accent"
            style={{ animation: `xo-thinking 1.1s ease-in-out ${n * 0.18}s infinite` }}
          />
        ))}
      </span>
    </div>
  );
}

/** Inline collapsible tool-call card (mirrors the app's tool result chip). */
export function ToolCard({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const failed = message.toolStatus === "error";
  const declined = message.toolStatus === "declined";
  const pretty = (() => {
    try {
      return JSON.stringify(message.toolResult ?? JSON.parse(message.content), null, 2);
    } catch {
      return message.content;
    }
  })();

  return (
    <div className="my-1.5 ml-9 max-w-[84%] overflow-hidden rounded-xl border border-border bg-surface-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full",
            failed || declined ? "text-danger" : "text-success",
          )}
        >
          {failed ? <IconX width={14} height={14} /> : declined ? <IconX width={14} height={14} /> : <IconBolt width={13} height={13} />}
        </span>
        <span className="font-mono text-[12px] text-text">{message.toolName}</span>
        <span className="truncate text-[12px] text-text-3">
          {declined ? "declined" : failed ? "failed" : "done"}
        </span>
        <IconChevron
          width={14}
          height={14}
          className={cn("ml-auto shrink-0 text-text-3 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-border bg-surface px-3 py-2 font-mono text-[11.5px] leading-relaxed text-text-2">
          {pretty}
        </pre>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "tool") return <ToolCard message={message} />;

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-1 py-1">
        <div className="max-w-[80%]">
          {message.images && message.images.length > 0 && (
            <div className="mb-1 flex flex-wrap justify-end gap-1.5">
              {message.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={`data:${img.mime};base64,${img.data}`}
                  alt="attachment"
                  className="max-h-44 rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}
          {message.content && (
            <div className="rounded-[18px] rounded-br-md bg-accent-soft px-[15px] py-[11px] text-[15px] leading-relaxed text-text">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex gap-2.5 px-1 py-1">
      <Mark size={26} className="mt-0.5 shrink-0 text-text" />
      <div className="min-w-0 max-w-[84%] pt-0.5">
        {message.thinking && (
          <details className="mb-1.5 text-[12.5px] text-text-3">
            <summary className="cursor-pointer select-none">Thought process</summary>
            <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 italic">{message.thinking}</div>
          </details>
        )}
        {message.content ? (
          <div className="xo-md text-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        ) : message.pendingToolCalls?.length ? (
          <div className="text-[13px] italic text-text-3">Calling {message.pendingToolCalls.map((t) => t.name).join(", ")}…</div>
        ) : null}
      </div>
    </div>
  );
}

/** Live streaming assistant draft (not yet committed). */
export function LiveAssistant({ text, thinking }: { text: string; thinking: string }) {
  return (
    <div className="flex gap-2.5 px-1 py-1">
      <Mark size={26} className="mt-0.5 shrink-0 text-text" />
      <div className="min-w-0 max-w-[84%] pt-0.5">
        {thinking && !text && <ThinkingDots />}
        {text && (
          <div className="xo-md text-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        )}
      </div>
    </div>
  );
}

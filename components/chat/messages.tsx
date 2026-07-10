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

/** Live plan checklist — rendered from the model's plan_update tool calls. */
export function PlanCard({ message }: { message: ChatMessage }) {
  const steps = ((message.toolResult as { steps?: Array<{ label: string; status: string }> })?.steps ?? []).slice(0, 20);
  if (!steps.length) return null;
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div className="my-1.5 ml-9 max-w-[84%] overflow-hidden rounded-xl border border-border bg-surface-2">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <IconCheck width={13} height={13} className="text-accent" />
        <span className="text-[12px] font-medium text-text">Plan</span>
        <span className="text-[11.5px] text-text-3">{done}/{steps.length}</span>
        <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="px-3 py-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 py-0.5 text-[12.5px]">
            <span
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                s.status === "done"
                  ? "border-transparent bg-accent text-on-ink"
                  : s.status === "active"
                    ? "border-accent"
                    : "border-border-strong",
              )}
            >
              {s.status === "done" && <IconCheck width={10} height={10} />}
              {s.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </span>
            <span className={cn(s.status === "done" ? "text-text-3 line-through" : "text-text-2")}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ArtifactData {
  title: string;
  type: "markdown" | "html" | "csv" | "code" | "text";
  content: string;
  filename: string;
}

/** Artifact card — preview/copy/download for documents the agent produced. */
export function ArtifactCard({ message }: { message: ChatMessage }) {
  const [preview, setPreview] = useState(false);
  const a = (message.toolResult as { artifact?: ArtifactData })?.artifact;
  if (!a) return null;

  const download = () => {
    const mime = { markdown: "text/markdown", html: "text/html", csv: "text/csv", code: "text/plain", text: "text/plain" }[a.type];
    const blob = new Blob([a.content], { type: mime });
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob);
    el.download = a.filename;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  const csvRows = a.type === "csv" && preview
    ? a.content.trim().split("\n").slice(0, 30).map((r) => r.split(","))
    : null;

  return (
    <div className="my-1.5 ml-9 max-w-[84%] overflow-hidden rounded-xl border border-border bg-surface-2">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface font-mono text-[10px] uppercase text-accent-text">
          {a.type === "markdown" ? "md" : a.type}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-text">{a.title}</div>
          <div className="truncate font-mono text-[11px] text-text-3">
            {a.filename} · {(a.content.length / 1024).toFixed(1)} KB
          </div>
        </div>
        <button
          onClick={() => setPreview((v) => !v)}
          className="rounded-full border border-border px-2.5 py-1 text-[12px] text-text-2 hover:text-text"
        >
          {preview ? "Hide" : "Preview"}
        </button>
        <button
          onClick={() => navigator.clipboard?.writeText(a.content)}
          className="rounded-full border border-border px-2.5 py-1 text-[12px] text-text-2 hover:text-text"
        >
          Copy
        </button>
        <button onClick={download} className="rounded-full bg-ink px-2.5 py-1 text-[12px] text-on-ink">
          Download
        </button>
      </div>
      {preview && (
        <div className="max-h-96 overflow-auto border-t border-border bg-surface px-4 py-3">
          {a.type === "markdown" && (
            <div className="xo-md text-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.content) }} />
          )}
          {a.type === "html" && (
            <iframe sandbox="" srcDoc={a.content} title={a.title} className="h-80 w-full rounded-lg border border-border bg-white" />
          )}
          {csvRows && (
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {csvRows.map((r, i) => (
                  <tr key={i} className={i === 0 ? "font-medium text-text" : "text-text-2"}>
                    {r.map((c, j) => (
                      <td key={j} className="border border-border px-2 py-1">{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(a.type === "code" || a.type === "text") && (
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-text-2">{a.content}</pre>
          )}
        </div>
      )}
    </div>
  );
}

/** A run of consecutive tool calls, grouped into one timeline card — ported
 *  from OpenWork's execution panel. Chips show status; each expands to its
 *  result. */
export function ToolRunGroup({ messages }: { messages: ChatMessage[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (messages.length === 1) return <ToolCard message={messages[0]} />;

  const failures = messages.filter((m) => m.toolStatus === "error" || m.toolStatus === "declined").length;

  return (
    <div className="my-1.5 ml-9 max-w-[84%] overflow-hidden rounded-xl border border-border bg-surface-2">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <IconBolt width={13} height={13} className="text-accent" />
        <span className="text-[12px] font-medium text-text">
          Ran {messages.length} tools
        </span>
        {failures > 0 && <span className="text-[11.5px] text-danger">{failures} failed</span>}
      </div>
      <div className="flex flex-col">
        {messages.map((m) => {
          const failed = m.toolStatus === "error";
          const declined = m.toolStatus === "declined";
          const open = openId === m.id;
          const pretty = (() => {
            try {
              return JSON.stringify(m.toolResult ?? JSON.parse(m.content), null, 2);
            } catch {
              return m.content;
            }
          })();
          return (
            <div key={m.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => setOpenId(open ? null : m.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface"
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center",
                    failed || declined ? "text-danger" : "text-success",
                  )}
                >
                  {failed || declined ? <IconX width={12} height={12} /> : <IconCheck width={12} height={12} />}
                </span>
                <span className="font-mono text-[11.5px] text-text">{m.toolName}</span>
                <span className="truncate text-[11.5px] text-text-3">
                  {declined ? "declined" : failed ? "failed" : "done"}
                </span>
                <IconChevron
                  width={13}
                  height={13}
                  className={cn("ml-auto shrink-0 text-text-3 transition-transform", open && "rotate-90")}
                />
              </button>
              {open && (
                <pre className="max-h-64 overflow-auto border-t border-border bg-surface px-3 py-2 font-mono text-[11.5px] leading-relaxed text-text-2">
                  {pretty}
                </pre>
              )}
            </div>
          );
        })}
      </div>
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
  if (message.role === "tool") {
    if (message.toolName === "plan_update" && message.toolStatus === "ok") return <PlanCard message={message} />;
    if (message.toolName === "present_artifact" && message.toolStatus === "ok") return <ArtifactCard message={message} />;
    return <ToolCard message={message} />;
  }

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

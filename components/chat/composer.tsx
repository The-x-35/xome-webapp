"use client";

import { useEffect, useRef, useState } from "react";
import { IconSend, IconStop, IconMic, IconPaperclip, IconBolt } from "@/components/chrome/icons";
import type { ImageAttachment } from "@/lib/agent/chat-message";
import { listSkills } from "@/lib/store/skills";
import { on } from "@/lib/store/bus";
import { cn } from "@/lib/utils";

interface SlashCommand {
  name: string;
  description: string;
  builtin?: boolean;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "compact", description: "Summarize older messages to free up context", builtin: true },
];

// Minimal SpeechRecognition typing (Web Speech API).
type SR = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onend: (() => void) | null; continuous: boolean; interimResults: boolean; lang: string };

export function Composer({
  running,
  onSend,
  onStop,
}: {
  running: boolean;
  onSend: (text: string, images?: ImageAttachment[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [listening, setListening] = useState(false);
  const [commands, setCommands] = useState<SlashCommand[]>(BUILTIN_COMMANDS);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SR | null>(null);

  // Load skills as slash commands (refreshed when the skills store changes).
  useEffect(() => {
    const load = () =>
      listSkills()
        .then((skills) =>
          setCommands([
            ...BUILTIN_COMMANDS,
            ...skills.filter((s) => s.enabled).map((s) => ({ name: s.name, description: s.description })),
          ]),
        )
        .catch(() => {});
    load();
    return on("skills", load);
  }, []);

  // Slash menu: visible while the draft is a bare "/token" (no space yet).
  const slashMatch = text.match(/^\/([a-z0-9-]*)$/i);
  const slashOptions = slashMatch
    ? commands.filter((c) => c.name.startsWith(slashMatch[1].toLowerCase())).slice(0, 6)
    : [];

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const submit = () => {
    if ((!text.trim() && images.length === 0) || running) return;
    onSend(text, images.length ? images : undefined);
    setText("");
    setImages([]);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: ImageAttachment[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      const buf = await f.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      next.push({ mime: f.type, data: btoa(bin) });
    }
    setImages((prev) => [...prev, ...next].slice(0, 4));
  };

  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r: SR = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    let base = text;
    r.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) interim += e.results[i][0].transcript;
      setText((base ? base + " " : "") + interim);
    };
    r.onend = () => {
      setListening(false);
      recogRef.current = null;
      base = "";
    };
    recogRef.current = r;
    setListening(true);
    r.start();
  };

  // Detected after mount so SSR and the first client render agree (the mic
  // button depends on browser APIs and must not differ during hydration).
  const [micAvailable, setMicAvailable] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    setMicAvailable(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-1">
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:${img.mime};base64,${img.data}`} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              <button
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-on-ink text-[11px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative rounded-[26px] border border-border-strong bg-surface px-3 py-2 shadow-[var(--shadow-composer)]">
        {slashOptions.length > 0 && (
          <div className="absolute bottom-full left-2 z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-card)]">
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">
              Commands &amp; skills
            </div>
            {slashOptions.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  setText(`/${c.name} `);
                  taRef.current?.focus();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
              >
                <IconBolt width={13} height={13} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[12.5px] text-text">/{c.name}</span>
                  {c.description && <span className="block truncate text-[11.5px] text-text-3">{c.description}</span>}
                </span>
                {c.builtin && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-3">built-in</span>}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={listening ? "Listening…" : "Message Xome"}
          style={{ outline: "none" }}
          className="max-h-52 w-full resize-none bg-transparent px-1.5 py-1.5 text-[15px] leading-relaxed text-text outline-none placeholder:text-text-3"
        />
        <div className="flex items-center gap-1 pt-1">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach image"
            className="xo-press grid h-9 w-9 place-items-center rounded-full text-text-2 hover:bg-surface-2"
          >
            <IconPaperclip width={20} height={20} />
          </button>
          {micAvailable && (
            <button
              onClick={toggleMic}
              title="Voice input"
              className={cn(
                "xo-press grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2",
                listening ? "text-accent" : "text-text-2",
              )}
            >
              <IconMic width={20} height={20} />
            </button>
          )}
          <div className="flex-1" />
          {running ? (
            <button
              onClick={onStop}
              title="Stop"
              className="xo-press grid h-10 w-10 place-items-center rounded-full bg-ink text-on-ink"
            >
              <IconStop width={18} height={18} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() && images.length === 0}
              title="Send"
              className={cn(
                "xo-press grid h-10 w-10 place-items-center rounded-full transition",
                text.trim() || images.length ? "bg-ink text-on-ink" : "bg-surface-2 text-text-3",
              )}
            >
              <IconSend width={19} height={19} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11.5px] text-text-3">
        Xome can act on your apps with your approval. It can make mistakes — check important actions.
      </p>
    </div>
  );
}

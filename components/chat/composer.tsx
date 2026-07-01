"use client";

import { useEffect, useRef, useState } from "react";
import { ModelMenu } from "./model-menu";
import { IconSend, IconStop, IconMic, IconPaperclip } from "@/components/chrome/icons";
import type { ImageAttachment } from "@/lib/agent/chat-message";
import { cn } from "@/lib/utils";

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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SR | null>(null);

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

  const micAvailable = typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-1">
      <div className="mb-2 flex items-center">
        <ModelMenu />
      </div>

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

      <div className="rounded-[26px] border border-border-strong bg-surface px-3 py-2 shadow-[var(--shadow-composer)]">
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/index";
import { readMemory, writeMemory, resetMemory } from "@/lib/store/memory";
import { IconChevron } from "@/components/chrome/icons";

export default function MemoryPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readMemory().then((m) => {
      setContent(m);
      setSaved(m);
      setLoading(false);
    });
  }, []);

  const dirty = content !== saved;

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-2 pt-6">
        <button onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2">
          <IconChevron width={18} height={18} className="rotate-180 text-text-2" />
        </button>
        <h1 className="font-display text-2xl font-medium tracking-[-0.01em]">Memory</h1>
      </div>
      <p className="mx-auto w-full max-w-2xl px-4 text-[13px] leading-relaxed text-text-2">
        Durable context Xome keeps about you, in plain Markdown. The model reads this every turn and can update it (with
        your approval) when you share something worth remembering. Stored only in this browser.
      </p>

      <div className="mx-auto mt-3 min-h-0 w-full max-w-2xl flex-1 px-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          spellCheck={false}
          className="h-full min-h-[300px] w-full resize-none rounded-[var(--radius-card)] border border-border bg-surface p-4 font-mono text-[13.5px] leading-relaxed text-text outline-none focus:border-accent"
        />
      </div>

      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <span className="text-[12.5px] text-text-3">
          {content.length} chars{dirty ? " · unsaved" : " · saved"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outlined"
            onClick={async () => {
              if (confirm("Reset memory to the default template?")) {
                await resetMemory();
                const m = await readMemory();
                setContent(m);
                setSaved(m);
              }
            }}
          >
            Reset
          </Button>
          <Button
            disabled={!dirty}
            onClick={async () => {
              await writeMemory(content);
              setSaved(content);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

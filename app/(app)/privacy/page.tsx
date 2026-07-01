"use client";

import { useRouter } from "next/navigation";
import { IconChevron } from "@/components/chrome/icons";

const STATS = [
  { n: "0", label: "servers in the data path for local models" },
  { n: "100%", label: "of conversations stored only in this browser" },
  { n: "your keys", label: "your bills, your providers, your control" },
];

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => router.push("/settings")} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2">
            <IconChevron width={18} height={18} className="rotate-180 text-text-2" />
          </button>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Privacy</h1>
        </div>

        <p className="font-display text-xl italic text-accent-text">Your data doesn&apos;t leave the room.</p>

        <div className="mt-5 flex flex-col gap-4 text-[14.5px] leading-relaxed text-text-2">
          <p>
            When you use the <strong className="text-text">on-device</strong> model, everything runs inside your browser
            via WebGPU. Your prompts, conversations, and any app data the model reads never touch a Xome server.
          </p>
          <p>
            When you choose a <strong className="text-text">cloud model</strong> (Claude, GPT, Gemini), your message goes
            to that provider with <strong className="text-text">your own API key</strong>. Xome relays the request through
            a stateless proxy so the browser can reach the API — the key passes through per-request and is never stored or
            logged on our side.
          </p>
          <p>
            <strong className="text-text">Integrations</strong> work the same way: OAuth tokens live in this browser&apos;s
            IndexedDB. When a tool runs, the token is attached to that single request through the proxy and discarded. We
            never hold a copy of your inbox, calendar, or messages.
          </p>
          <p>
            <strong className="text-text">History &amp; memory</strong> are stored in your browser only. Clearing them in
            Settings (or clearing site data) wipes them completely.
          </p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <div className="font-display text-2xl font-semibold text-text">{s.n}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-text-2">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

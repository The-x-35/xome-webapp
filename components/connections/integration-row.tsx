"use client";

import { useState } from "react";
import { Tag, Button, Spinner } from "@/components/ui/index";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";
import { connectOAuth, disconnectOAuth } from "@/lib/integrations/oauth-client";
import { setNotionToken, deleteNotionToken } from "@/lib/store/secrets";
import { getPrefs, setPrefs } from "@/lib/store/prefs";
import { emit } from "@/lib/store/bus";

export function IntegrationRow({
  descriptor,
  connected,
  account,
  onChanged,
}: {
  descriptor: IntegrationDescriptor;
  connected: boolean;
  account: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showNotion, setShowNotion] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setError(null);
    if (descriptor.authKind === "notion") {
      setShowNotion(true);
      return;
    }
    setBusy(true);
    try {
      await connectOAuth(descriptor.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      if (descriptor.authKind === "notion") {
        await deleteNotionToken();
        const enabled = new Set(getPrefs().enabledIntegrations);
        enabled.delete("notion");
        setPrefs({ enabledIntegrations: [...enabled] });
        emit("connections");
      } else {
        await disconnectOAuth(descriptor.id);
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveNotion = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try {
      await setNotionToken(token.trim());
      const enabled = new Set(getPrefs().enabledIntegrations);
      enabled.add("notion");
      setPrefs({ enabledIntegrations: [...enabled] });
      emit("connections");
      setShowNotion(false);
      setToken("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
          style={{ background: descriptor.tint }}
        >
          {descriptor.label.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-text">{descriptor.label}</span>
            {connected ? <Tag kind="success" dot>Connected</Tag> : <Tag kind="neutral">Not connected</Tag>}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-text-2">{account || descriptor.tagline}</div>
        </div>
        <div className="shrink-0">
          {busy ? (
            <Spinner />
          ) : connected ? (
            <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={disconnect}>
              Disconnect
            </Button>
          ) : (
            <Button className="!px-4 !py-2 text-[13px]" onClick={connect}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

      {showNotion && (
        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[12.5px] text-text-2">
            Create an internal integration at notion.so/profile/integrations, share the pages you want with it, then
            paste its secret (starts with <span className="font-mono">ntn_</span> or <span className="font-mono">secret_</span>).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ntn_…"
              className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent"
            />
            <Button className="!px-4 !py-2 text-[13px]" onClick={saveNotion} disabled={!token.trim()}>Save</Button>
            <Button variant="outlined" className="!px-3 !py-2 text-[13px]" onClick={() => setShowNotion(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/index";
import { getApiKey, setApiKey, deleteApiKey } from "@/lib/store/secrets";

export function ApiKeyDialog({
  provider,
  label,
  hint,
  onClose,
}: {
  provider: string;
  label: string;
  hint?: string;
  onClose: (changed: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    getApiKey(provider).then((k) => {
      if (k) {
        setExisting(true);
        setValue("");
      }
    });
  }, [provider]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-[var(--scrim)]" onClick={() => onClose(false)} />
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-xl font-semibold">{label} API key</h2>
        {hint && <p className="mt-1 text-[13px] text-text-2">{hint}</p>}
        <input
          type="password"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          placeholder={existing ? "•••••••••• (key set, type to replace)" : "Paste your API key"}
          className="mt-4 w-full rounded-[var(--radius-input)] border border-border bg-surface-2 px-3.5 py-3 font-mono text-[13px] text-text outline-none focus:border-accent"
        />
        <div className="mt-5 flex items-center justify-between gap-2">
          {existing ? (
            <Button
              variant="text"
              onClick={async () => {
                await deleteApiKey(provider);
                onClose(true);
              }}
              className="text-danger"
            >
              Remove key
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outlined" onClick={() => onClose(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (value.trim()) await setApiKey(provider, value.trim());
                onClose(true);
              }}
              disabled={!value.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

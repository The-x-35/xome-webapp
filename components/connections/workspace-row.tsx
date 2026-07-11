"use client";

import { useEffect, useState } from "react";
import { Tag, Button } from "@/components/ui/index";
import {
  isWorkspaceSupported,
  connectWorkspace,
  disconnectWorkspace,
  workspaceName,
  restoreWorkspace,
} from "@/lib/integrations/workspace/workspace-bridge";
import { on } from "@/lib/store/bus";

/** "Local folder" connection, grants the agent scoped file access via the
 *  File System Access API. Reads are free; writes always ask. */
export function WorkspaceRow() {
  const [supported, setSupported] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isWorkspaceSupported());
    const load = () => workspaceName().then(setName).catch(() => setName(null));
    void restoreWorkspace(false).then(load);
    return on("connections", load);
  }, []);

  const connect = async () => {
    setError(null);
    try {
      const n = await connectWorkspace();
      setName(n);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/abort/i.test(msg)) setError(msg);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-[18px]">
          📁
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-text">Local folder</span>
            {name ? <Tag kind="success" dot>Connected</Tag> : <Tag kind="neutral">Not connected</Tag>}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-text-2">
            {name
              ? `Xome can read & write inside "${name}", writes always ask first.`
              : "Let Xome work on files in a folder you pick. Reads are free; writes always ask."}
          </div>
        </div>
        <div className="shrink-0">
          {name ? (
            <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={() => disconnectWorkspace().then(() => setName(null))}>
              Disconnect
            </Button>
          ) : (
            <Button className="!px-4 !py-2 text-[13px]" onClick={connect} disabled={!supported}>
              {supported ? "Pick folder" : "Not supported"}
            </Button>
          )}
        </div>
      </div>
      {!supported && (
        <p className="mt-2 text-[12.5px] text-text-3">Folder access needs Chrome or Edge (File System Access API).</p>
      )}
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

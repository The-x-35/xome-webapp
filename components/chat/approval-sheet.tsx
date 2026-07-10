"use client";

import { useState } from "react";
import { Mark } from "@/components/ui/mark";
import { Button } from "@/components/ui/index";
import { ConsentLevel, NEVER_ALWAYS_ALLOW, type ApprovalRequest } from "@/lib/agent/tools/consent";

/** The consent sheet — shown before any alwaysAsk / first askOncePerSession tool
 *  runs. Mirrors approval_sheet.dart: tool name, args JSON, remember toggles. */
export function ApprovalSheet({
  req,
  onResolve,
}: {
  req: ApprovalRequest;
  onResolve: (approved: boolean, remember: boolean, always: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  const [always, setAlways] = useState(false);
  const hasArgs = req.args && Object.keys(req.args).length > 0;
  const canAlwaysAllow = !NEVER_ALWAYS_ALLOW.has(req.toolName);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[var(--scrim)]" onClick={() => onResolve(false, false, false)} />
      <div className="relative z-10 w-full max-w-md rounded-t-[var(--radius-sheet)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:rounded-[var(--radius-sheet)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong sm:hidden" />
        <div className="flex items-center gap-3">
          <Mark size={36} className="text-text" />
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
              Run <span className="font-mono text-[17px]">{req.toolName}</span>?
            </h2>
          </div>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-text-2">{req.description}</p>

        {hasArgs && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">Arguments</div>
            <pre className="max-h-56 overflow-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text-2">
              {JSON.stringify(req.args, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          {req.consent === ConsentLevel.askOncePerSession && (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-text-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Don&apos;t ask again this session
            </label>
          )}
          {canAlwaysAllow ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-text-2">
              <input
                type="checkbox"
                checked={always}
                onChange={(e) => setAlways(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                Always allow <span className="font-mono text-[12.5px]">{req.toolName}</span>
                <span className="block text-[11.5px] text-text-3">Revoke anytime in Settings → Permissions</span>
              </span>
            </label>
          ) : (
            <p className="text-[11.5px] text-text-3">
              This action asks every time — it can&apos;t be added to the always-allow list.
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2.5">
          <Button variant="outlined" className="flex-1" onClick={() => onResolve(false, false, false)}>
            Decline
          </Button>
          <Button variant="filled" className="flex-1" onClick={() => onResolve(true, remember, always)}>
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag, Spinner, EmptyState } from "@/components/ui/index";
import { Toggle } from "@/components/settings/primitives";
import { IconBolt, IconPlus, IconTrash, IconChevron } from "@/components/chrome/icons";
import {
  listAutomations,
  saveAutomation,
  deleteAutomation,
  addAudit,
  listAudit,
} from "@/lib/store/automations";
import type { AutomationRecord, AuditRecord } from "@/lib/store/db";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { PROVIDER_LABELS } from "@/lib/agent/providers/registry";
import { runHeadless } from "@/lib/agent/run-headless";
import { getPrefs } from "@/lib/store/prefs";
import { timeAgo } from "@/lib/utils";
import type { ProviderId } from "@/lib/store/prefs";

const TRIGGERS: { id: AutomationRecord["triggerType"]; label: string }[] = [
  { id: "time_of_day", label: "At a time of day" },
  { id: "gmail_new_match", label: "New matching email" },
  { id: "slack_mention", label: "Slack mention" },
  { id: "github_issue_assigned", label: "GitHub issue assigned" },
];

export default function AutomationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AutomationRecord[]>([]);
  const [editing, setEditing] = useState<Partial<AutomationRecord> | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [audit, setAudit] = useState<Record<string, AuditRecord[]>>({});

  const load = () => listAutomations().then(setItems);
  useEffect(() => {
    load();
  }, []);

  const runNow = async (a: AutomationRecord) => {
    setRunning(a.id);
    try {
      const res = await runHeadless(a.instruction, {
        providerId: a.provider as ProviderId,
        allowedWrites: new Set(a.allowedWrites),
      });
      await addAudit({
        automationId: a.id,
        ranAt: Date.now(),
        trigger: "manual",
        toolCalls: res.toolCalls,
        outcome: res.error ? `Error: ${res.error}` : res.text.slice(0, 280) || "Completed",
      });
      setAudit((m) => ({ ...m, [a.id]: [] }));
      listAudit(a.id).then((logs) => setAudit((m) => ({ ...m, [a.id]: logs })));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => router.push("/settings")} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2">
            <IconChevron width={18} height={18} className="rotate-180 text-text-2" />
          </button>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Automations</h1>
        </div>
        <p className="mb-6 text-[13px] leading-relaxed text-text-2">
          Define an instruction Xome runs on a trigger. Writes only fire for integrations you pre-approve here. Run-now
          works today; scheduled and push triggers run when the optional relay is configured.
        </p>

        {!editing && (
          <Button className="mb-6" onClick={() => setEditing({ triggerType: "time_of_day", allowedWrites: [], enabled: true, provider: getPrefs().activeProvider })}>
            <IconPlus width={17} height={17} /> New automation
          </Button>
        )}

        {editing && (
          <AutomationForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (rec) => {
              await saveAutomation(rec);
              setEditing(null);
              load();
            }}
          />
        )}

        {items.length === 0 && !editing ? (
          <EmptyState icon={<IconBolt width={40} height={40} />} title="No automations yet" body="Create one to have Xome work on a schedule or trigger." />
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {items.map((a) => (
              <div key={a.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-accent-text"><IconBolt width={18} height={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-text">{a.name}</div>
                    <div className="text-[12.5px] text-text-2">{TRIGGERS.find((t) => t.id === a.triggerType)?.label} · {PROVIDER_LABELS[a.provider as ProviderId]}</div>
                  </div>
                  <Toggle on={a.enabled} onChange={async () => { await saveAutomation({ ...a, enabled: !a.enabled }); load(); }} />
                  <button onClick={async () => { if (confirm(`Delete "${a.name}"?`)) { await deleteAutomation(a.id); load(); } }} className="grid h-8 w-8 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-danger">
                    <IconTrash width={16} height={16} />
                  </button>
                </div>
                <p className="mt-2 line-clamp-2 text-[13.5px] text-text-2">{a.instruction}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {a.allowedWrites.length === 0 ? (
                    <Tag kind="neutral">read-only</Tag>
                  ) : (
                    a.allowedWrites.map((w) => <Tag key={w} kind="warning">writes {w}</Tag>)
                  )}
                  <div className="flex-1" />
                  <Button variant="outlined" className="!px-3 !py-1.5 text-[12.5px]" onClick={() => runNow(a)} disabled={running === a.id}>
                    {running === a.id ? <Spinner size={13} /> : "Run now"}
                  </Button>
                </div>
                {audit[a.id]?.length > 0 && (
                  <div className="mt-3 border-t border-border pt-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">Recent runs</div>
                    {audit[a.id].slice(0, 4).map((log) => (
                      <div key={log.id} className="flex items-start gap-2 py-1 text-[12px] text-text-2">
                        <span className="shrink-0 text-text-3">{timeAgo(log.ranAt)}</span>
                        <span className="min-w-0 flex-1">
                          {log.outcome}
                          {log.toolCalls.length > 0 && (
                            <span className="ml-1 font-mono text-text-3">[{log.toolCalls.map((t) => t.name).join(", ")}]</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AutomationForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<AutomationRecord>;
  onSave: (rec: Omit<AutomationRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [trigger, setTrigger] = useState<AutomationRecord["triggerType"]>(initial.triggerType ?? "time_of_day");
  const [instruction, setInstruction] = useState(initial.instruction ?? "");
  const [writes, setWrites] = useState<string[]>(initial.allowedWrites ?? []);

  const toggleWrite = (id: string) =>
    setWrites((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <div className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Automation name" className="w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
      <div className="mt-3">
        <label className="text-[12px] font-medium text-text-2">Trigger</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationRecord["triggerType"])} className="mt-1 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[14px] outline-none focus:border-accent">
          {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <label className="text-[12px] font-medium text-text-2">Instruction</label>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="e.g. Summarize my unread Slack mentions and email me a brief." className="mt-1 w-full resize-none rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
      </div>
      <div className="mt-3">
        <label className="text-[12px] font-medium text-text-2">Allow writes to</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {INTEGRATIONS.map((i) => (
            <button key={i.id} onClick={() => toggleWrite(i.id)} className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${writes.includes(i.id) ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface-2 text-text-2"}`}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outlined" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!name.trim() || !instruction.trim()}
          onClick={() =>
            onSave({
              id: initial.id,
              name: name.trim(),
              enabled: initial.enabled ?? true,
              triggerType: trigger,
              triggerConfig: initial.triggerConfig ?? {},
              instruction: instruction.trim(),
              allowedWrites: writes,
              provider: initial.provider ?? getPrefs().activeProvider,
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

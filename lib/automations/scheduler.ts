"use client";

import { listAutomations, saveAutomation, addAudit } from "@/lib/store/automations";
import { runHeadless } from "@/lib/agent/run-headless";
import type { ProviderId } from "@/lib/store/prefs";

/**
 * In-tab automation scheduler. While Xome is open, time_of_day automations run
 * at their configured HH:MM (once per day). This is honest about its limits —
 * nothing runs with the tab closed; the automations UI says so.
 */

const TICK_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const autos = await listAutomations();
    for (const a of autos) {
      if (!a.enabled || a.triggerType !== "time_of_day") continue;
      const at = String(a.triggerConfig?.time ?? "");
      if (at !== hhmm) continue;
      if (a.lastRunAt && sameDay(a.lastRunAt, Date.now())) continue;

      a.lastRunAt = Date.now();
      await saveAutomation(a);
      try {
        const res = await runHeadless(a.instruction, {
          providerId: a.provider as ProviderId,
          allowedWrites: new Set(a.allowedWrites),
        });
        await addAudit({
          automationId: a.id,
          ranAt: Date.now(),
          trigger: `scheduled ${at}`,
          toolCalls: res.toolCalls,
          outcome: res.error ? `error: ${res.error}` : res.text.slice(0, 200) || "completed",
        });
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`Automation ran: ${a.name}`, { body: res.error ?? res.text.slice(0, 120) });
          }
        } catch {
          /* notifications unavailable */
        }
      } catch (e) {
        await addAudit({
          automationId: a.id,
          ranAt: Date.now(),
          trigger: `scheduled ${at}`,
          toolCalls: [],
          outcome: `error: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  } catch {
    /* stores unavailable — retry next tick */
  } finally {
    ticking = false;
  }
}

/** Start the scheduler (idempotent; called from the app shell on mount). */
export function startScheduler(): () => void {
  if (timer) return () => {};
  timer = setInterval(() => void tick(), TICK_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

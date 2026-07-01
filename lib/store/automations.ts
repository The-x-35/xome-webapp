"use client";

import { db, uid, type AutomationRecord, type AuditRecord } from "./db";

export async function listAutomations(): Promise<AutomationRecord[]> {
  return (await db()).getAll("automations");
}

export async function saveAutomation(
  rec: Omit<AutomationRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<AutomationRecord> {
  const now = Date.now();
  const existing = rec.id ? await (await db()).get("automations", rec.id) : undefined;
  const full: AutomationRecord = {
    id: rec.id ?? uid(),
    name: rec.name,
    enabled: rec.enabled,
    triggerType: rec.triggerType,
    triggerConfig: rec.triggerConfig,
    instruction: rec.instruction,
    allowedWrites: rec.allowedWrites,
    provider: rec.provider,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await (await db()).put("automations", full);
  return full;
}

export async function deleteAutomation(id: string): Promise<void> {
  await (await db()).delete("automations", id);
}

export async function listAudit(automationId: string): Promise<AuditRecord[]> {
  const idx = (await db()).transaction("audit").store.index("automationId");
  const recs = await idx.getAll(automationId);
  return recs.sort((a, b) => b.ranAt - a.ranAt);
}

export async function addAudit(rec: Omit<AuditRecord, "id">): Promise<void> {
  await (await db()).put("audit", { ...rec, id: uid() });
}

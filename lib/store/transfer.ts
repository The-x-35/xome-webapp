"use client";

import { db, uid, type SkillRecord, type McpServerRecord, type AutomationRecord } from "./db";
import { getPrefs, setPrefs, type Prefs } from "./prefs";
import { listSkills, saveSkill } from "./skills";
import { readMemory, writeMemory } from "./memory";
import { emit } from "./bus";

/**
 * Setup export/import, move a Xome configuration between browsers/machines.
 * SECRETS ARE NEVER EXPORTED: no API keys, no OAuth tokens, no Notion token,
 * and MCP bearer tokens are stripped. (Ported lesson from OpenWork, which had
 * to patch secret leakage out of workspace exports, we start safe.)
 */

export interface SetupBundle {
  kind: "xome-setup";
  version: 1;
  exportedAt: number;
  prefs: Prefs;
  skills: Array<Pick<SkillRecord, "name" | "description" | "triggers" | "content" | "enabled">>;
  mcpServers: Array<Pick<McpServerRecord, "name" | "url" | "enabled">>;
  automations: Array<Omit<AutomationRecord, "id" | "createdAt" | "updatedAt">>;
  memory?: string;
}

export async function exportSetup(opts: { includeMemory: boolean }): Promise<SetupBundle> {
  const d = await db();
  const [skills, mcpServers, automations] = await Promise.all([
    listSkills(),
    d.getAll("mcpServers"),
    d.getAll("automations"),
  ]);
  return {
    kind: "xome-setup",
    version: 1,
    exportedAt: Date.now(),
    prefs: getPrefs(),
    skills: skills.map(({ name, description, triggers, content, enabled }) => ({
      name, description, triggers, content, enabled,
    })),
    // bearerToken deliberately dropped, reconnect on the new machine.
    mcpServers: mcpServers.map(({ name, url, enabled }) => ({ name, url, enabled })),
    automations: automations.map(({ name, enabled, triggerType, triggerConfig, instruction, allowedWrites, provider }) => ({
      name, enabled, triggerType, triggerConfig, instruction, allowedWrites, provider,
    })),
    ...(opts.includeMemory ? { memory: await readMemory() } : {}),
  };
}

/** Import a bundle, merging into the current setup. Existing skills with the
 *  same name and MCP servers with the same URL are updated, not duplicated. */
export async function importSetup(bundle: SetupBundle): Promise<{ skills: number; mcp: number; automations: number }> {
  if (bundle.kind !== "xome-setup" || bundle.version !== 1) {
    throw new Error("Not a valid Xome setup file.");
  }
  const d = await db();

  // Prefs: apply, but never let an import mark onboarding incomplete, and keep
  // this machine's active workspace (the imported id may not exist here).
  setPrefs({
    ...bundle.prefs,
    onboardingComplete: getPrefs().onboardingComplete || bundle.prefs.onboardingComplete,
    activeWorkspaceId: getPrefs().activeWorkspaceId,
  });

  const existingSkills = await listSkills();
  for (const s of bundle.skills) {
    const match = existingSkills.find((e) => e.name === s.name);
    await saveSkill({ ...s, id: match?.id });
  }

  const existingMcp = await d.getAll("mcpServers");
  for (const m of bundle.mcpServers) {
    const match = existingMcp.find((e) => e.url === m.url);
    await d.put("mcpServers", {
      id: match?.id ?? uid(),
      name: m.name,
      url: m.url,
      bearerToken: match?.bearerToken ?? null,
      enabled: m.enabled,
      tools: match?.tools ?? [],
      status: match?.status ?? "unknown",
      lastError: null,
      updatedAt: Date.now(),
    });
  }

  const existingAuto = await d.getAll("automations");
  for (const a of bundle.automations) {
    const match = existingAuto.find((e) => e.name === a.name);
    await d.put("automations", {
      ...a,
      id: match?.id ?? uid(),
      createdAt: match?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  if (bundle.memory && bundle.memory.trim()) await writeMemory(bundle.memory);

  emit("connections");
  emit("skills");
  emit("prefs");
  return { skills: bundle.skills.length, mcp: bundle.mcpServers.length, automations: bundle.automations.length };
}

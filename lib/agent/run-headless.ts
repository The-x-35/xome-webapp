"use client";

import { runOrchestrator } from "./orchestrator";
import { buildRegistry } from "./build-registry";
import { getProvider } from "./providers/registry";
import type { ApprovalResult } from "./tools/consent";
import { ConsentLevel } from "./tools/consent";
import { getPrefs } from "@/lib/store/prefs";
import { getApiKey } from "@/lib/store/secrets";
import { readMemory } from "@/lib/store/memory";
import { modelSupportsFunctionCalling } from "@/lib/models/catalog";
import { accountFor } from "@/lib/integrations/oauth-client";
import { getNotionToken } from "@/lib/store/secrets";
import type { ProviderId } from "@/lib/store/prefs";

export interface HeadlessResult {
  text: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
  error: string | null;
}

/**
 * Run an instruction headlessly for an automation. Writes are auto-approved ONLY
 * for integrations the automation was pre-approved for (allowedWrites); any
 * other write is declined, mirrors the app's automation consent rule.
 */
export async function runHeadless(
  instruction: string,
  opts: { providerId: ProviderId; allowedWrites: Set<string> },
): Promise<HeadlessResult> {
  const prefs = getPrefs();
  const provider = getProvider(opts.providerId);

  let model: string | undefined;
  let apiKey: string | undefined;
  let supportsFc = true;
  if (provider.isLocal) {
    model = prefs.localModelId ?? undefined;
    if (!model) return { text: "", toolCalls: [], error: "No on-device model installed." };
    supportsFc = modelSupportsFunctionCalling(model);
  } else {
    model = prefs.models[opts.providerId] || provider.defaultModel || undefined;
    apiKey = (await getApiKey(opts.providerId)) ?? undefined;
    if (!apiKey) return { text: "", toolCalls: [], error: `No API key for ${provider.displayName}.` };
  }

  const enabled = new Set(prefs.enabledIntegrations);
  const accounts: Record<string, string | null> = {};
  for (const id of enabled) accounts[id] = id === "notion" ? ((await getNotionToken()) ? "workspace" : null) : await accountFor(id);

  const registry = await buildRegistry(enabled);
  const memory = await readMemory();

  const toolCalls: HeadlessResult["toolCalls"] = [];
  let text = "";
  let error: string | null = null;

  const gate = async (req: { consent: ConsentLevel; toolName: string }): Promise<ApprovalResult> => {
    // preApproved tools never reach the gate. For writes, approve only if the
    // tool's integration is pre-approved for this automation.
    const tool = registry.byName(req.toolName);
    const integ = tool?.integrationId;
    const ok = integ ? opts.allowedWrites.has(integ) : false;
    return { approved: ok };
  };

  for await (const ev of runOrchestrator({
    provider,
    registry,
    history: [],
    userInput: instruction,
    model,
    apiKey,
    enabledIntegrations: enabled,
    activeIntegrationAccounts: accounts,
    modelSupportsFunctionCalling: supportsFc,
    memory,
    gate,
    onAppendMessage: () => {},
  })) {
    if (ev.kind === "assistant_delta") text += ev.text;
    else if (ev.kind === "tool_finished") toolCalls.push({ name: ev.name, ok: true });
    else if (ev.kind === "tool_failed") toolCalls.push({ name: ev.name, ok: false });
    else if (ev.kind === "error") error = ev.message;
  }
  return { text, toolCalls, error };
}

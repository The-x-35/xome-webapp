"use client";

import type { ChatMessage, ImageAttachment } from "./chat-message";
import { runOrchestrator } from "./orchestrator";
import { buildRegistry } from "./build-registry";
import { getProvider } from "./providers/registry";
import { newMessage } from "./chat-message";
import type { ApprovalRequest, ApprovalResult } from "./tools/consent";
import { listSkills, matchSkills, parseSlashSkill } from "@/lib/store/skills";
import { getPrefs } from "@/lib/store/prefs";
import { getApiKey, getNotionToken } from "@/lib/store/secrets";
import { readMemory } from "@/lib/store/memory";
import { modelSupportsFunctionCalling } from "@/lib/models/catalog";
import { accountFor } from "@/lib/integrations/oauth-client";
import {
  getConversation,
  createConversation,
  saveConversation,
  deriveTitle,
} from "@/lib/store/conversations";
import type { ConversationRecord } from "@/lib/store/db";
import { emit } from "@/lib/store/bus";

/**
 * Module-level run manager — runs live OUTSIDE React so navigating away from a
 * conversation no longer kills its agent run (ported idea from OpenWork/Cowork
 * background sessions). Chat views subscribe per-conversation; the sidebar
 * subscribes to the global running set.
 */

export interface PendingApproval {
  req: ApprovalRequest;
  resolve: (r: ApprovalResult) => void;
}

export interface RunState {
  running: boolean;
  liveText: string;
  liveThinking: string;
  statusText: string | null;
  error: string | null;
  pendingApproval: PendingApproval | null;
  /** Post-turn follow-up suggestions (cloud providers only). */
  suggestions: string[];
}

export const IDLE_RUN: RunState = {
  running: false,
  liveText: "",
  liveThinking: "",
  statusText: null,
  error: null,
  pendingApproval: null,
  suggestions: [],
};

interface Session {
  state: RunState;
  messages: ChatMessage[];
  convo: ConversationRecord;
  abort: AbortController | null;
}

type Listener = () => void;

const sessions = new Map<string, Session>();
const listeners = new Map<string, Set<Listener>>();

function notify(convId: string): void {
  listeners.get(convId)?.forEach((l) => l());
  emit("runs");
}

export function subscribeRun(convId: string, fn: Listener): () => void {
  let set = listeners.get(convId);
  if (!set) {
    set = new Set();
    listeners.set(convId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(convId);
  };
}

export function getRunState(convId: string | null): RunState {
  return (convId && sessions.get(convId)?.state) || IDLE_RUN;
}

/** Live message array while a session exists (running or just finished). */
export function getLiveMessages(convId: string | null): ChatMessage[] | null {
  if (!convId) return null;
  return sessions.get(convId)?.messages ?? null;
}

export function runningIds(): Set<string> {
  const out = new Set<string>();
  for (const [id, s] of sessions) if (s.state.running) out.add(id);
  return out;
}

function patch(convId: string, p: Partial<RunState>): void {
  const s = sessions.get(convId);
  if (!s) return;
  s.state = { ...s.state, ...p };
  notify(convId);
}

export function stopRun(convId: string): void {
  const s = sessions.get(convId);
  if (!s) return;
  s.abort?.abort();
  s.abort = null;
  s.state = { ...s.state, running: false, statusText: null, pendingApproval: null, liveText: "", liveThinking: "" };
  notify(convId);
}

export function resolveRunApproval(convId: string, result: ApprovalResult): void {
  const s = sessions.get(convId);
  s?.state.pendingApproval?.resolve(result);
  patch(convId, { pendingApproval: null });
}

export function dismissRunError(convId: string): void {
  patch(convId, { error: null });
}

/** Untag live sessions from a deleted workspace so their next persist doesn't
 *  resurrect its id (the stored records were already moved to Personal). */
export function clearWorkspaceTag(workspaceId: string): void {
  for (const s of sessions.values()) {
    if (s.convo.workspaceId === workspaceId) s.convo.workspaceId = undefined;
  }
}

/** Drop a finished session so views re-read messages from IndexedDB (used
 *  after out-of-band edits like /compact). No-op while running. */
export function dropSession(convId: string): void {
  const s = sessions.get(convId);
  if (s && !s.state.running) {
    sessions.delete(convId);
    notify(convId);
  }
}

export function clearSuggestions(convId: string): void {
  patch(convId, { suggestions: [] });
}

async function persist(s: Session): Promise<void> {
  s.convo.messages = s.messages;
  if (s.convo.title === "New chat") s.convo.title = deriveTitle(s.messages);
  await saveConversation(s.convo);
  emit("conversations");
}

function notifyDone(title: string, body: string): void {
  if (typeof document === "undefined" || !document.hidden) return;
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission();
    }
  } catch {
    /* notifications unavailable */
  }
}

/** Fire-and-forget: ask the (cloud) provider for 3 short follow-up actions. */
async function generateSuggestions(s: Session, convId: string): Promise<void> {
  try {
    const prefs = getPrefs();
    const providerId = (s.convo.providerOverride as typeof prefs.activeProvider) || prefs.activeProvider;
    const provider = getProvider(providerId);
    if (provider.isLocal) return; // too slow to be worth it on-device
    const apiKey = (await getApiKey(providerId)) ?? undefined;
    if (!apiKey) return;
    const model = s.convo.modelOverride || prefs.models[providerId] || provider.defaultModel || undefined;

    const recent = s.messages
      .slice(-6)
      .map((m) => (m.role === "user" ? `User: ${m.content}` : m.role === "assistant" ? `Assistant: ${m.content}` : ""))
      .filter(Boolean)
      .join("\n");
    let text = "";
    for await (const ev of provider.generate({
      messages: [newMessage({ role: "user", content: `Given this conversation, suggest 3 short follow-up actions the user might want next (max 6 words each). Reply with ONLY a JSON array of strings.\n\n${recent}` })],
      tools: [],
      systemPrompt: "You suggest concise next actions. Output only a JSON array of 3 short strings.",
      model,
      apiKey,
    })) {
      if (ev.kind === "text") text += ev.text;
      if (ev.kind === "error") return;
    }
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as unknown[];
    const suggestions = parsed.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 3);
    if (suggestions.length && sessions.get(convId) === s && !s.state.running) {
      patch(convId, { suggestions });
    }
  } catch {
    /* suggestions are best-effort */
  }
}

async function resolveActiveIntegrations(): Promise<{
  enabled: Set<string>;
  accounts: Record<string, string | null>;
}> {
  const enabled = new Set(getPrefs().enabledIntegrations);
  const accounts: Record<string, string | null> = {};
  for (const id of enabled) {
    if (id === "notion") accounts[id] = (await getNotionToken()) ? "workspace" : null;
    else accounts[id] = await accountFor(id);
  }
  return { enabled, accounts };
}

/**
 * Start (or continue) a run. Creates the conversation when convId is null and
 * returns the id immediately; the run continues in the background regardless
 * of which view is mounted.
 */
export async function startRun(convId: string | null, text: string, images?: ImageAttachment[]): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return convId;
  if (convId && sessions.get(convId)?.state.running) return convId;

  const ws = getPrefs().activeWorkspaceId;
  const convo = convId
    ? ((await getConversation(convId)) ?? (await createConversation(undefined, ws)))
    : await createConversation(undefined, ws);
  const id = convo.id;

  const session: Session = {
    state: { ...IDLE_RUN, running: true },
    messages: [...convo.messages],
    convo,
    abort: new AbortController(),
  };
  sessions.set(id, session);
  notify(id);

  void executeRun(session, id, trimmed, images);
  return id;
}

async function executeRun(session: Session, id: string, trimmed: string, images?: ImageAttachment[]): Promise<void> {
  const prefs = getPrefs();
  const providerId = (session.convo.providerOverride as typeof prefs.activeProvider) || prefs.activeProvider;
  const provider = getProvider(providerId);

  let model: string | undefined;
  let apiKey: string | undefined;
  let supportsFc = true;

  if (provider.isLocal) {
    model = session.convo.modelOverride || prefs.localModelId || undefined;
    if (!model) {
      patch(id, { running: false, error: "Pick an on-device model in Settings, or switch to a cloud provider with an API key." });
      return;
    }
    supportsFc = modelSupportsFunctionCalling(model);
  } else {
    model = session.convo.modelOverride || prefs.models[providerId] || provider.defaultModel || undefined;
    apiKey = (await getApiKey(providerId)) ?? undefined;
    if (!apiKey) {
      patch(id, { running: false, error: `Add your ${provider.displayName} API key in Settings to use this provider.` });
      return;
    }
  }

  const { enabled, accounts } = await resolveActiveIntegrations();
  const registry = await buildRegistry(enabled);
  const memory = await readMemory();
  const firstName = prefs.userName?.trim().split(/\s+/)[0] ?? null;

  // Skills: /name invokes one explicitly; otherwise lexical trigger match.
  let userInput = trimmed;
  let activeSkills: Array<{ name: string; content: string }> = [];
  try {
    const skills = await listSkills();
    const slash = parseSlashSkill(trimmed, skills);
    if (slash) {
      activeSkills = [{ name: slash.skill.name, content: slash.skill.content }];
      userInput = slash.rest || `Run your "${slash.skill.name}" skill.`;
    } else {
      activeSkills = matchSkills(trimmed, skills).map((s) => ({ name: s.name, content: s.content }));
    }
  } catch {
    /* skills store unavailable */
  }

  const gate = (req: ApprovalRequest) =>
    new Promise<ApprovalResult>((resolve) => {
      patch(id, { pendingApproval: { req, resolve } });
    });

  const abort = session.abort!;
  const history = session.messages.slice();

  try {
    for await (const ev of runOrchestrator({
      provider,
      registry,
      history,
      userInput,
      images,
      userFirstName: firstName,
      model,
      apiKey,
      enabledIntegrations: enabled,
      activeIntegrationAccounts: accounts,
      modelSupportsFunctionCalling: supportsFc,
      memory,
      skills: activeSkills,
      alwaysAllowed: new Set(getPrefs().toolAllowlist),
      gate,
      signal: abort.signal,
      onAppendMessage: (m) => {
        session.messages = [...session.messages, m];
        if (m.role === "assistant") {
          session.state = { ...session.state, liveText: "", liveThinking: "" };
        }
        notify(id);
        void persist(session);
      },
    })) {
      switch (ev.kind) {
        case "assistant_delta":
          session.state = { ...session.state, liveText: session.state.liveText + ev.text };
          notify(id);
          break;
        case "thinking_delta":
          session.state = { ...session.state, liveThinking: session.state.liveThinking + ev.text };
          notify(id);
          break;
        case "tool_started":
          patch(id, { statusText: `Running ${ev.name}…`, pendingApproval: null });
          break;
        case "tool_finished":
        case "tool_failed":
        case "tool_declined":
          patch(id, { statusText: null });
          break;
        case "usage": {
          const u = session.convo.usage ?? { input: 0, output: 0 };
          session.convo.usage = { input: u.input + ev.inputTokens, output: u.output + ev.outputTokens };
          void persist(session);
          break;
        }
        case "error":
          patch(id, { error: ev.message });
          break;
        case "turn_ended":
          break;
      }
    }
  } catch (e) {
    if (!abort.signal.aborted) {
      patch(id, { error: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    session.abort = null;
    patch(id, { running: false, statusText: null, pendingApproval: null, liveText: "", liveThinking: "" });
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (lastAssistant) {
      notifyDone("Xome finished", lastAssistant.content.slice(0, 120));
      void generateSuggestions(session, id);
    }
  }
}

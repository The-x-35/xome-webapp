"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ImageAttachment } from "./chat-message";
import { runOrchestrator } from "./orchestrator";
import { buildRegistry } from "./build-registry";
import { getProvider } from "./providers/registry";
import type { ApprovalRequest, ApprovalResult } from "./tools/consent";
import { getPrefs } from "@/lib/store/prefs";
import { getApiKey } from "@/lib/store/secrets";
import { readMemory } from "@/lib/store/memory";
import { modelSupportsFunctionCalling } from "@/lib/models/catalog";
import { accountFor } from "@/lib/integrations/oauth-client";
import { getNotionToken } from "@/lib/store/secrets";
import {
  getConversation,
  saveConversation,
  createConversation,
  deriveTitle,
} from "@/lib/store/conversations";
import type { ConversationRecord } from "@/lib/store/db";
import { emit } from "@/lib/store/bus";

export interface PendingApproval {
  req: ApprovalRequest;
  resolve: (r: ApprovalResult) => void;
}

export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  liveText: string;
  liveThinking: string;
  running: boolean;
  statusText: string | null;
  error: string | null;
  pendingApproval: PendingApproval | null;
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

export function useChat(initialId: string | null) {
  const [state, setState] = useState<ChatState>({
    conversationId: initialId,
    messages: [],
    liveText: "",
    liveThinking: "",
    running: false,
    statusText: null,
    error: null,
    pendingApproval: null,
  });

  const convoRef = useRef<ConversationRecord | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load existing conversation when the id changes.
  useEffect(() => {
    let alive = true;
    if (!initialId) {
      convoRef.current = null;
      setState((s) => ({ ...s, conversationId: null, messages: [], liveText: "", liveThinking: "", error: null }));
      return;
    }
    getConversation(initialId).then((c) => {
      if (!alive) return;
      convoRef.current = c ?? null;
      setState((s) => ({
        ...s,
        conversationId: initialId,
        messages: c?.messages ?? [],
        liveText: "",
        liveThinking: "",
        error: null,
      }));
    });
    return () => {
      alive = false;
    };
  }, [initialId]);

  const persist = useCallback(async (messages: ChatMessage[]) => {
    let convo = convoRef.current;
    if (!convo) {
      convo = await createConversation();
      convoRef.current = convo;
      setState((s) => ({ ...s, conversationId: convo!.id }));
    }
    convo.messages = messages;
    if (convo.title === "New chat") convo.title = deriveTitle(messages);
    await saveConversation(convo);
    emit("conversations");
  }, []);

  const send = useCallback(
    async (text: string, images?: ImageAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed || state.running) return;

      const prefs = getPrefs();
      const providerId = (convoRef.current?.providerOverride as typeof prefs.activeProvider) || prefs.activeProvider;
      const provider = getProvider(providerId);

      let model: string | undefined;
      let apiKey: string | undefined;
      let supportsFc = true;

      if (provider.isLocal) {
        model = convoRef.current?.modelOverride || prefs.localModelId || undefined;
        if (!model) {
          setState((s) => ({ ...s, error: "Pick an on-device model in Settings, or switch to a cloud provider with an API key." }));
          return;
        }
        supportsFc = modelSupportsFunctionCalling(model);
      } else {
        model = convoRef.current?.modelOverride || prefs.models[providerId] || provider.defaultModel || undefined;
        apiKey = (await getApiKey(providerId)) ?? undefined;
        if (!apiKey) {
          setState((s) => ({ ...s, error: `Add your ${provider.displayName} API key in Settings to use this provider.` }));
          return;
        }
      }

      const { enabled, accounts } = await resolveActiveIntegrations();
      const registry = await buildRegistry(enabled);
      const memory = await readMemory();
      const firstName = prefs.userName?.trim().split(/\s+/)[0] ?? null;

      const abort = new AbortController();
      abortRef.current = abort;

      const committed: ChatMessage[] = [...state.messages];
      setState((s) => ({ ...s, running: true, error: null, liveText: "", liveThinking: "", statusText: null }));

      const gate = (req: ApprovalRequest) =>
        new Promise<ApprovalResult>((resolve) => {
          setState((s) => ({ ...s, pendingApproval: { req, resolve } }));
        });

      try {
        for await (const ev of runOrchestrator({
          provider,
          registry,
          history: state.messages,
          userInput: trimmed,
          images,
          userFirstName: firstName,
          model,
          apiKey,
          enabledIntegrations: enabled,
          activeIntegrationAccounts: accounts,
          modelSupportsFunctionCalling: supportsFc,
          memory,
          gate,
          signal: abort.signal,
          onAppendMessage: (m) => {
            committed.push(m);
            const snapshot = [...committed];
            setState((s) => ({
              ...s,
              messages: snapshot,
              // Clear the live draft once the assistant message is committed.
              liveText: m.role === "assistant" ? "" : s.liveText,
              liveThinking: m.role === "assistant" ? "" : s.liveThinking,
            }));
            void persist(snapshot);
          },
        })) {
          switch (ev.kind) {
            case "assistant_delta":
              setState((s) => ({ ...s, liveText: s.liveText + ev.text }));
              break;
            case "thinking_delta":
              setState((s) => ({ ...s, liveThinking: s.liveThinking + ev.text }));
              break;
            case "tool_started":
              setState((s) => ({ ...s, statusText: `Running ${ev.name}…`, pendingApproval: null }));
              break;
            case "tool_finished":
            case "tool_failed":
            case "tool_declined":
              setState((s) => ({ ...s, statusText: null }));
              break;
            case "error":
              setState((s) => ({ ...s, error: ev.message }));
              break;
            case "turn_ended":
              break;
          }
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
        }
      } finally {
        abortRef.current = null;
        setState((s) => ({ ...s, running: false, statusText: null, pendingApproval: null, liveText: "", liveThinking: "" }));
      }
    },
    [state.running, state.messages, persist],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, running: false, statusText: null }));
  }, []);

  const resolveApproval = useCallback((approved: boolean, remember = false) => {
    setState((s) => {
      s.pendingApproval?.resolve({ approved, rememberForSession: remember });
      return { ...s, pendingApproval: null };
    });
  }, []);

  const dismissError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { state, send, stop, resolveApproval, dismissError };
}

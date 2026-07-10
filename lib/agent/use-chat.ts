"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ImageAttachment } from "./chat-message";
import { compactMessages } from "./compact";
import { getProvider } from "./providers/registry";
import { NEVER_ALWAYS_ALLOW } from "./tools/consent";
import {
  startRun,
  stopRun,
  resolveRunApproval,
  dismissRunError,
  clearSuggestions,
  dropSession,
  subscribeRun,
  getRunState,
  getLiveMessages,
  type PendingApproval,
} from "./run-manager";
import { getPrefs, setPrefs } from "@/lib/store/prefs";
import { getApiKey } from "@/lib/store/secrets";
import { getConversation, saveConversation } from "@/lib/store/conversations";
import { emit } from "@/lib/store/bus";

export type { PendingApproval };

export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  liveText: string;
  liveThinking: string;
  running: boolean;
  statusText: string | null;
  error: string | null;
  pendingApproval: PendingApproval | null;
  suggestions: string[];
}

/**
 * Chat hook — a thin subscriber over the module-level run manager. Runs
 * continue in the background when this hook unmounts (navigation), and
 * re-attach when the conversation is opened again.
 */
export function useChat(initialId: string | null) {
  const [conversationId, setConversationId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [run, setRun] = useState(() => getRunState(initialId));
  const compactingRef = useRef(false);

  // Reset to the route's conversation when it changes.
  useEffect(() => {
    setConversationId(initialId);
  }, [initialId]);

  // Load messages + subscribe to the manager for live updates.
  useEffect(() => {
    let alive = true;
    const sync = () => {
      if (!alive) return;
      setRun(getRunState(conversationId));
      const live = getLiveMessages(conversationId);
      if (live) setMessages([...live]);
    };

    if (!conversationId) {
      setMessages([]);
      setRun(getRunState(null));
      return;
    }

    const live = getLiveMessages(conversationId);
    if (live) {
      setMessages([...live]);
      setRun(getRunState(conversationId));
    } else {
      getConversation(conversationId).then((c) => {
        if (alive) setMessages(c?.messages ?? []);
      });
      setRun(getRunState(conversationId));
    }

    const unsub = subscribeRun(conversationId, sync);
    return () => {
      alive = false;
      unsub();
    };
  }, [conversationId]);

  const send = useCallback(
    async (text: string, images?: ImageAttachment[]) => {
      if (run.running) return;
      if (conversationId) clearSuggestions(conversationId);
      const id = await startRun(conversationId, text, images);
      if (id && id !== conversationId) setConversationId(id);
    },
    [conversationId, run.running],
  );

  const stop = useCallback(() => {
    if (conversationId) stopRun(conversationId);
  }, [conversationId]);

  const resolveApproval = useCallback(
    (approved: boolean, remember = false, always = false) => {
      if (!conversationId) return;
      const toolName = getRunState(conversationId).pendingApproval?.req.toolName;
      if (approved && always && toolName && !NEVER_ALWAYS_ALLOW.has(toolName)) {
        const list = new Set(getPrefs().toolAllowlist);
        list.add(toolName);
        setPrefs({ toolAllowlist: [...list] });
      }
      resolveRunApproval(conversationId, { approved, rememberForSession: remember, rememberAlways: always });
    },
    [conversationId],
  );

  const dismissError = useCallback(() => {
    if (conversationId) dismissRunError(conversationId);
  }, [conversationId]);

  /** Compact the conversation: summarize older turns into one message. */
  const compact = useCallback(async () => {
    if (!conversationId || run.running || compactingRef.current) return;
    const convo = await getConversation(conversationId);
    if (!convo || convo.messages.length === 0) return;

    const prefs = getPrefs();
    const providerId = (convo.providerOverride as typeof prefs.activeProvider) || prefs.activeProvider;
    const provider = getProvider(providerId);
    let model: string | undefined;
    let apiKey: string | undefined;
    if (provider.isLocal) {
      model = convo.modelOverride || prefs.localModelId || undefined;
    } else {
      model = convo.modelOverride || prefs.models[providerId] || provider.defaultModel || undefined;
      apiKey = (await getApiKey(providerId)) ?? undefined;
    }

    compactingRef.current = true;
    setRun((r) => ({ ...r, running: true, statusText: "Compacting conversation…" }));
    try {
      const compacted = await compactMessages({ provider, messages: convo.messages, model, apiKey });
      if (!compacted) {
        setRun((r) => ({ ...r, running: false, statusText: null, error: "Conversation is too short to compact." }));
        return;
      }
      convo.messages = compacted;
      await saveConversation(convo);
      // Drop the finished manager session so later syncs don't resurrect the
      // pre-compaction message array.
      dropSession(conversationId);
      emit("conversations");
      setMessages(compacted);
      setRun((r) => ({ ...r, running: false, statusText: null }));
    } catch (e) {
      setRun((r) => ({ ...r, running: false, statusText: null, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      compactingRef.current = false;
    }
  }, [conversationId, run.running]);

  const state: ChatState = {
    conversationId,
    messages,
    liveText: run.liveText,
    liveThinking: run.liveThinking,
    running: run.running,
    statusText: run.statusText,
    error: run.error,
    pendingApproval: run.pendingApproval,
    suggestions: run.suggestions,
  };

  return { state, send, stop, resolveApproval, dismissError, compact };
}

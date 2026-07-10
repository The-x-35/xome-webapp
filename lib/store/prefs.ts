"use client";

/**
 * Synchronous, localStorage-backed preferences — the web analogue of the app's
 * `preferences.dart` (SharedPreferences). Small scalar settings that the UI
 * needs immediately and on first paint (theme, accent, active provider/model).
 * Larger / sensitive data lives in IndexedDB (see db.ts, secrets.ts).
 */

export type ThemeMode = "light" | "dark" | "system";
export type AccentId = "indigo" | "blue" | "green" | "ink" | "violet";
export type ProviderId = "webllm" | "anthropic" | "openai" | "google";

export interface Prefs {
  theme: ThemeMode;
  accent: AccentId;
  /** Active "brain" — which provider answers by default. */
  activeProvider: ProviderId;
  /** Per-provider chosen model id (overrides provider default). */
  models: Partial<Record<ProviderId, string>>;
  /** Local model id selected during onboarding (WebLLM model record id). */
  localModelId: string | null;
  onboardingComplete: boolean;
  userName: string | null;
  /** Integrations the user has switched on (gates which tools the model sees). */
  enabledIntegrations: string[];
  /** Active web-search engine when multiple keys are present. */
  searchEngine: "tavily" | "brave" | "duckduckgo";
  voiceOut: boolean;
  pushToTalk: boolean;
  /** Tools the user has permanently approved ("always allow"). Money-moving
   *  tools can never appear here (see NEVER_ALWAYS_ALLOW in consent.ts). */
  toolAllowlist: string[];
}

const KEY = "xome.prefs";

export const DEFAULTS: Prefs = {
  theme: "system",
  accent: "indigo",
  activeProvider: "webllm",
  models: {},
  localModelId: null,
  onboardingComplete: false,
  userName: null,
  enabledIntegrations: [],
  searchEngine: "duckduckgo",
  voiceOut: false,
  pushToTalk: true,
  toolAllowlist: [],
};

type Listener = (p: Prefs) => void;
const listeners = new Set<Listener>();

let cache: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode — keep in-memory */
    }
  }
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribePrefs(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resolve whether dark mode is active given the current theme pref. */
export function resolveDark(theme: ThemeMode): boolean {
  if (typeof window === "undefined") return false;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

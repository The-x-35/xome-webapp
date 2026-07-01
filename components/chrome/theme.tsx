"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getPrefs,
  setPrefs,
  subscribePrefs,
  resolveDark,
  DEFAULTS,
  type Prefs,
  type ThemeMode,
  type AccentId,
} from "@/lib/store/prefs";

interface ThemeCtx {
  prefs: Prefs;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
  update: (patch: Partial<Prefs>) => void;
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from server-safe defaults so the first client render matches the
  // SSR output (no hydration mismatch). Real prefs from localStorage are loaded
  // in the mount effect below; the pre-paint bootstrap script in layout.tsx has
  // already applied the correct theme/accent to <html>, so there's no flash.
  const [prefs, setLocal] = useState<Prefs>(DEFAULTS);
  const [isDark, setIsDark] = useState(false);

  const apply = useCallback((p: Prefs) => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolveDark(p.theme));
    root.setAttribute("data-accent", p.accent);
  }, []);

  useEffect(() => {
    const actual = getPrefs();
    setLocal(actual);
    setIsDark(resolveDark(actual.theme));
    apply(actual);

    const unsub = subscribePrefs((p) => {
      setLocal(p);
      setIsDark(resolveDark(p.theme));
      apply(p);
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => {
      if (getPrefs().theme === "system") {
        apply(getPrefs());
        setIsDark(resolveDark("system"));
      }
    };
    mq.addEventListener("change", onSys);
    return () => {
      unsub();
      mq.removeEventListener("change", onSys);
    };
  }, [apply]);

  const value: ThemeCtx = {
    prefs,
    isDark,
    setTheme: (t) => setPrefs({ theme: t }),
    setAccent: (a) => setPrefs({ accent: a }),
    update: (patch) => setPrefs(patch),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}

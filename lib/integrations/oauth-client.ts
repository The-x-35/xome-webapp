"use client";

import { getOAuth, setOAuth, deleteOAuth, type OAuthToken } from "@/lib/store/secrets";
import { proxyFetch, type ProxyRequest, type ProxyResult } from "@/lib/net/proxy";
import { getPrefs, setPrefs } from "@/lib/store/prefs";
import { emit } from "@/lib/store/bus";

/** Open the OAuth popup and resolve once the callback posts the token back. */
export function connectOAuth(integration: string): Promise<OAuthToken> {
  return new Promise((resolve, reject) => {
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      `/api/oauth/start?integration=${encodeURIComponent(integration)}`,
      "xome-oauth",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup) {
      reject(new Error("Popup blocked. Allow popups for this site and try again."));
      return;
    }

    const onMsg = async (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "xome-oauth") return;
      window.removeEventListener("message", onMsg);
      clearInterval(closedTimer);
      if (!d.ok) {
        reject(new Error(d.error ? `OAuth failed: ${d.error}` : "OAuth failed"));
        return;
      }
      if (d.integration !== integration) {
        reject(new Error("OAuth integration mismatch"));
        return;
      }
      await setOAuth(integration, d.token as OAuthToken);
      const enabled = new Set(getPrefs().enabledIntegrations);
      enabled.add(integration);
      setPrefs({ enabledIntegrations: [...enabled] });
      emit("connections");
      resolve(d.token as OAuthToken);
    };
    window.addEventListener("message", onMsg);

    const closedTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedTimer);
        window.removeEventListener("message", onMsg);
        reject(new Error("Connection cancelled."));
      }
    }, 700);
  });
}

export async function disconnectOAuth(integration: string): Promise<void> {
  await deleteOAuth(integration);
  const enabled = new Set(getPrefs().enabledIntegrations);
  enabled.delete(integration);
  setPrefs({ enabledIntegrations: [...enabled] });
  emit("connections");
}

async function refresh(integration: string, token: OAuthToken): Promise<OAuthToken | null> {
  if (!token.refreshToken) return null;
  const res = await fetch("/api/oauth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integration, refreshToken: token.refreshToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string; refreshToken?: string; expiresAt?: number | null };
  const next: OAuthToken = {
    ...token,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? token.refreshToken,
    expiresAt: data.expiresAt ?? null,
  };
  await setOAuth(integration, next);
  return next;
}

/**
 * Authenticated proxy fetch for an OAuth integration. Attaches the bearer
 * token, proactively refreshes if near expiry, and on a 401 refreshes once and
 * retries. Returns the same ProxyResult as proxyFetch.
 */
export async function authedFetch(
  integration: string,
  reqArgs: Omit<ProxyRequest, "headers"> & { headers?: Record<string, string> },
): Promise<ProxyResult> {
  let token = await getOAuth(integration);
  if (!token) throw new Error(`${integration} is not connected.`);

  // Proactive refresh when expiring within 60s.
  if (token.expiresAt && token.expiresAt - Date.now() < 60_000 && token.refreshToken) {
    token = (await refresh(integration, token)) ?? token;
  }

  const withAuth = (t: OAuthToken): Record<string, string> => ({
    ...(reqArgs.headers ?? {}),
    authorization: `Bearer ${t.accessToken}`,
  });

  let res = await proxyFetch({ ...reqArgs, headers: withAuth(token) });
  if (res.status === 401 && token.refreshToken) {
    const refreshed = await refresh(integration, token);
    if (refreshed) res = await proxyFetch({ ...reqArgs, headers: withAuth(refreshed) });
  }
  return res;
}

/** The account label shown in the system prompt / connections row. */
export async function accountFor(integration: string): Promise<string | null> {
  const t = await getOAuth(integration);
  return t?.account ?? null;
}

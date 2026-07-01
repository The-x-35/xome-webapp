/**
 * Server-only OAuth configuration. Reads web OAuth credentials from env so the
 * app activates once you register OAuth apps for app.xome.bot and set these.
 * Redirect URIs to register:
 *   {origin}/api/oauth/callback/google
 *   {origin}/api/oauth/callback/slack
 *   {origin}/api/oauth/callback/github
 */

import type { NextRequest } from "next/server";

export type AuthProvider = "google" | "slack" | "github";

/**
 * Public origin of the request, honoring reverse-proxy headers. Behind ngrok in
 * dev — and behind the load balancer that fronts app.xome.bot in prod — the real
 * public host/scheme arrive in `x-forwarded-host` / `x-forwarded-proto`, while
 * `req.nextUrl.origin` reports the internal address (e.g. localhost:3000). OAuth
 * redirect URIs must be the *public* origin, so prefer the forwarded values.
 */
export function requestOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

export interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  usesPkce: boolean;
}

/** Hostname that identifies the production origin. When a request comes in on
 *  this host, the `*_CLIENT_ID_PROD` / `*_CLIENT_SECRET_PROD` env vars are used
 *  (falling back to the base vars if unset). Override with XOME_PROD_HOST. */
const PROD_HOST = process.env.XOME_PROD_HOST || "app.xome.bot";

function isProdOrigin(origin?: string): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === PROD_HOST || h.endsWith("." + PROD_HOST);
  } catch {
    return false;
  }
}

/** Pick prod credentials when serving the production origin, else the base
 *  (localhost/dev) ones. Prod falls back to the base vars when `*_PROD` is unset
 *  — so a provider using one OAuth app with multiple redirect URIs (Google,
 *  Slack) needs no `*_PROD` vars, while a provider needing separate dev/prod
 *  apps (GitHub) just sets them. */
function creds(prefix: string, prod: boolean): { clientId?: string; clientSecret?: string } {
  const id = prod ? process.env[`${prefix}_CLIENT_ID_PROD`] || process.env[`${prefix}_CLIENT_ID`] : process.env[`${prefix}_CLIENT_ID`];
  const secret = prod
    ? process.env[`${prefix}_CLIENT_SECRET_PROD`] || process.env[`${prefix}_CLIENT_SECRET`]
    : process.env[`${prefix}_CLIENT_SECRET`];
  return { clientId: id, clientSecret: secret };
}

export function providerConfig(p: AuthProvider, origin?: string): ProviderConfig {
  const prod = isProdOrigin(origin);
  switch (p) {
    case "google":
      return {
        ...creds("GOOGLE", prod),
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        usesPkce: true,
      };
    case "slack":
      return {
        ...creds("SLACK", prod),
        authorizeUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        usesPkce: false,
      };
    case "github":
      return {
        ...creds("GITHUB", prod),
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        usesPkce: false,
      };
  }
}

/** integration id → { provider, scopes }. */
export const INTEGRATION_AUTH: Record<string, { provider: AuthProvider; scopes: string[] }> = {
  gmail: {
    provider: "google",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  },
  calendar: {
    provider: "google",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  slack: {
    provider: "slack",
    scopes: [
      "chat:write", "channels:read", "channels:history", "groups:read", "groups:history",
      "im:read", "im:history", "mpim:read", "mpim:history", "search:read", "users:read",
    ],
  },
  github: {
    provider: "github",
    scopes: ["repo", "read:user", "notifications"],
  },
};

export function redirectUri(origin: string, provider: AuthProvider): string {
  return `${origin}/api/oauth/callback/${provider}`;
}

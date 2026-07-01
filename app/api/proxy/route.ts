import { NextRequest } from "next/server";

/**
 * Stateless integration proxy. The browser sends { url, method, headers, body }
 * with the integration's bearer token / API key already in `headers`. We verify
 * the host is on the allowlist (so this can't be turned into an open relay),
 * forward the request, and return the response. No tokens are stored or logged.
 */
export const runtime = "edge";

const ALLOWED_HOST_SUFFIXES = [
  // Google (Gmail + Calendar + OAuth + token)
  "googleapis.com",
  "oauth2.googleapis.com",
  "accounts.google.com",
  "generativelanguage.googleapis.com",
  // Slack
  "slack.com",
  // GitHub
  "api.github.com",
  "github.com",
  // Notion
  "api.notion.com",
  // Web search
  "api.tavily.com",
  "api.search.brave.com",
  "duckduckgo.com",
  // Public data utilities
  "wikipedia.org",
  "api.open-meteo.com",
  "open-meteo.com",
  "api.frankfurter.app",
  "frankfurter.app",
  "libretranslate.de",
  "libretranslate.com",
];

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}

export async function POST(req: NextRequest) {
  let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { url, method = "GET", headers = {}, body } = payload;
  if (!url) return Response.json({ error: "missing_url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "bad_url" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !hostAllowed(target.hostname)) {
    return Response.json({ error: "host_not_allowed", host: target.hostname }, { status: 403 });
  }

  const upstream = await fetch(target.toString(), {
    method,
    headers,
    body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

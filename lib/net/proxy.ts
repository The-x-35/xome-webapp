"use client";

/**
 * Client helper for the stateless integration proxy (/api/proxy). Integration
 * clients call `proxyFetch` instead of fetch() so requests go out from the
 * server (no browser CORS) with the user's token attached per-request.
 */

export interface ProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Object → JSON-stringified; string passed through. */
  body?: unknown;
}

export interface ProxyResult {
  ok: boolean;
  status: number;
  json: <T = unknown>() => T;
  text: string;
}

export async function proxyFetch(reqArgs: ProxyRequest): Promise<ProxyResult> {
  const body =
    reqArgs.body == null
      ? undefined
      : typeof reqArgs.body === "string"
        ? reqArgs.body
        : JSON.stringify(reqArgs.body);

  const res = await fetch("/api/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: reqArgs.url,
      method: reqArgs.method ?? "GET",
      headers: reqArgs.headers ?? {},
      body,
    }),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    text,
    json: <T = unknown>() => {
      try {
        return JSON.parse(text) as T;
      } catch {
        return {} as T;
      }
    },
  };
}

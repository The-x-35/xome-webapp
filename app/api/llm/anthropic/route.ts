import { NextRequest } from "next/server";

/**
 * Stateless Claude proxy. The browser builds the full Anthropic request body
 * and sends its API key in `x-xome-key`. We attach the key, forward to
 * Anthropic, and stream the SSE straight back. The key is never logged or
 * persisted, this route holds no state.
 */
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-xome-key");
  if (!key) return new Response("Missing API key", { status: 401 });
  const body = await req.text();

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      accept: "text/event-stream",
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-store",
    },
  });
}

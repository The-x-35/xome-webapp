import { NextRequest } from "next/server";

/** Stateless GPT proxy — see anthropic/route.ts for the model. */
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-xome-key");
  if (!key) return new Response("Missing API key", { status: 401 });
  const body = await req.text();

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
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

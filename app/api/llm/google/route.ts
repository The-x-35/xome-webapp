import { NextRequest } from "next/server";

/** Stateless Gemini proxy. Model id comes via ?model=, key via x-xome-key. */
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-xome-key");
  if (!key) return new Response("Missing API key", { status: 401 });
  const model = req.nextUrl.searchParams.get("model") || "gemini-2.5-flash";
  const body = await req.text();

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(key)}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
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

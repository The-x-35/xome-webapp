import { NextRequest } from "next/server";

/**
 * MCP proxy, forwards JSON-RPC to a user-configured MCP server (arbitrary
 * public URL, SSRF-guarded) and returns the parsed result plus the
 * Mcp-Session-Id header so the client can persist the session. Handles both
 * single-JSON and text/event-stream responses.
 */
export const runtime = "nodejs";

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === "[::1]") return true;
  return false;
}

export async function POST(req: NextRequest) {
  let payload: { url?: string; bearerToken?: string; sessionId?: string; rpc?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { url, bearerToken, sessionId, rpc } = payload;
  if (!url) return Response.json({ error: "missing_url" }, { status: 400 });
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "bad_url" }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return Response.json({ error: "host_not_allowed" }, { status: 403 });
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method: "POST", headers, body: JSON.stringify(rpc) });
  } catch (e) {
    return Response.json({ error: "unreachable", message: String(e) }, { status: 502 });
  }

  const newSession = upstream.headers.get("mcp-session-id");
  const ct = upstream.headers.get("content-type") ?? "";
  const text = await upstream.text();

  // Notifications return 202 with no body.
  if (!text.trim()) {
    return Response.json({ status: upstream.status, sessionId: newSession, result: null });
  }

  let result: unknown = null;
  if (ct.includes("text/event-stream")) {
    // Take the first data: JSON frame.
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try { result = JSON.parse(line.slice(5).trim()); } catch { /* skip */ }
        if (result) break;
      }
    }
  } else {
    try { result = JSON.parse(text); } catch { result = text; }
  }
  return Response.json({ status: upstream.status, sessionId: newSession, result });
}

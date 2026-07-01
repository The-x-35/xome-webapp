import { NextRequest } from "next/server";

/**
 * web_fetch_url backend. Fetches an arbitrary public URL and returns the main
 * text content (scripts/styles/nav stripped). Blocks private/loopback hosts to
 * avoid SSRF. Capped at 8000 chars to fit the model's context budget.
 */
export const runtime = "nodejs";

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 private / loopback / link-local ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return true;
  return false;
}

function extractText(html: string): { title: string; content: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return { title, content: stripped.slice(0, 8000) };
}

export async function POST(req: NextRequest) {
  let url: string;
  try {
    url = (await req.json()).url;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "bad_url" }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return Response.json({ error: "host_not_allowed" }, { status: 403 });
  }
  try {
    const res = await fetch(target.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; XomeBot/1.0)" },
      redirect: "follow",
    });
    const html = await res.text();
    const { title, content } = extractText(html);
    return Response.json({ url: target.toString(), title, content });
  } catch (e) {
    return Response.json({ error: "fetch_failed", message: String(e) }, { status: 502 });
  }
}

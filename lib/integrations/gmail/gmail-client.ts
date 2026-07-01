"use client";

import { authedFetch } from "@/lib/integrations/oauth-client";

/** Gmail REST client. Every call goes through authedFetch("gmail", …) so the
 *  user's OAuth token is attached server-side via the proxy. */

const BASE = "https://gmail.googleapis.com";

export interface GmailSearchHit {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

export interface DraftArgs {
  to: string;
  subject: string;
  body: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string };
  parts?: GmailPart[];
}

interface RawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailPart;
}

/** base64url-decode a string into UTF-8 text. */
function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** UTF-8-safe base64url-encode for the raw RFC822 message. */
function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find((x) => x.name.toLowerCase() === lower);
  return h?.value ?? "";
}

/** Walk the MIME tree and extract a plain-text body, preferring text/plain. */
function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return "";

  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: GmailPart): void => {
    const mime = (part.mimeType ?? "").toLowerCase();
    const data = part.body?.data;
    if (data && mime === "text/plain") {
      plain.push(decodeBase64Url(data));
    } else if (data && mime === "text/html") {
      html.push(decodeBase64Url(data));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  if (plain.length) return plain.join("\n").trim();
  if (html.length) {
    return html
      .join("\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  // Single-part message stored directly on the payload body.
  if (payload.body?.data && !payload.parts?.length) {
    return decodeBase64Url(payload.body.data).trim();
  }
  return "";
}

function buildMime(args: SendArgs): string {
  const lines: string[] = [];
  lines.push(`To: ${args.to}`);
  if (args.cc?.length) lines.push(`Cc: ${args.cc.join(", ")}`);
  if (args.bcc?.length) lines.push(`Bcc: ${args.bcc.join(", ")}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(args.body);
  return lines.join("\r\n");
}

class GmailClient {
  async search(query: string, max: number): Promise<GmailSearchHit[]> {
    const res = await authedFetch("gmail", {
      url: `${BASE}/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    });
    if (!res.ok) throw new Error(`Gmail search failed (${res.status}): ${res.text}`);
    const data = res.json<{ messages?: Array<{ id: string }> }>();
    const ids = (data.messages ?? []).slice(0, max).map((m) => m.id);

    const hits = await Promise.all(
      ids.map(async (id): Promise<GmailSearchHit> => {
        const r = await authedFetch("gmail", {
          url: `${BASE}/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        });
        const msg = r.json<RawMessage>();
        const headers = msg.payload?.headers;
        const snippet = msg.snippet ?? "";
        return {
          id,
          from: headerValue(headers, "From"),
          subject: headerValue(headers, "Subject"),
          date: headerValue(headers, "Date"),
          snippet: snippet.length > 120 ? `${snippet.slice(0, 120)}…` : snippet,
        };
      }),
    );
    return hits;
  }

  async getMessage(id: string): Promise<GmailMessage> {
    const res = await authedFetch("gmail", {
      url: `${BASE}/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    });
    if (!res.ok) throw new Error(`Gmail getMessage failed (${res.status}): ${res.text}`);
    const msg = res.json<RawMessage>();
    const headers = msg.payload?.headers;
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      subject: headerValue(headers, "Subject"),
      date: headerValue(headers, "Date"),
      snippet: msg.snippet ?? "",
      body: extractPlainText(msg.payload),
    };
  }

  async sendMessage(args: SendArgs): Promise<{ id: string; threadId: string }> {
    const raw = encodeBase64Url(buildMime(args));
    const res = await authedFetch("gmail", {
      url: `${BASE}/gmail/v1/users/me/messages/send`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { raw },
    });
    if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${res.text}`);
    const data = res.json<{ id: string; threadId: string }>();
    return { id: data.id, threadId: data.threadId };
  }

  async createDraft(args: DraftArgs): Promise<{ draftId: string }> {
    const raw = encodeBase64Url(buildMime({ to: args.to, subject: args.subject, body: args.body }));
    const res = await authedFetch("gmail", {
      url: `${BASE}/gmail/v1/users/me/drafts`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { message: { raw } },
    });
    if (!res.ok) throw new Error(`Gmail draft failed (${res.status}): ${res.text}`);
    const data = res.json<{ id: string }>();
    return { draftId: data.id };
  }

  async listLabels(): Promise<GmailLabel[]> {
    const res = await authedFetch("gmail", {
      url: `${BASE}/gmail/v1/users/me/labels`,
    });
    if (!res.ok) throw new Error(`Gmail listLabels failed (${res.status}): ${res.text}`);
    const data = res.json<{ labels?: GmailLabel[] }>();
    return data.labels ?? [];
  }
}

export const gmail = new GmailClient();

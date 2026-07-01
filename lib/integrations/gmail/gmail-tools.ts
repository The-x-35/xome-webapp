"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { gmail } from "@/lib/integrations/gmail/gmail-client";

/** Gmail tools — search, read, send, draft, and list labels. All calls go
 *  through the GmailClient (authedFetch) and never throw: failures return
 *  { error, message }. */

export const gmailTools: Tool[] = [
  defineTool({
    name: "gmail_search",
    description:
      "Search the user's Gmail and return compact message summaries. Supports Gmail query syntax, e.g. from:alice@example.com, to:me, subject:invoice, after:2024/01/01, before:2024/12/31, label:important, is:starred, has:attachment. Returns { count, messages }.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (Gmail query syntax)." },
        max: { type: "integer", description: "Max messages 1–20 (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "gmail",
    group: "Gmail",
    invoke: async (args) => {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "empty_query", message: "query is required" };
      const max = Math.min(20, Math.max(1, Number(args.max ?? 5)));
      try {
        const messages = await gmail.search(query, max);
        return { count: messages.length, messages };
      } catch (e) {
        return { error: "search_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "gmail_get_message",
    description:
      "Fetch a single Gmail message by id and return its headers (from, to, subject, date), snippet, and plain-text body.",
    parameterSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The Gmail message id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "gmail",
    group: "Gmail",
    invoke: async (args) => {
      const id = String(args.id ?? "").trim();
      if (!id) return { error: "empty_id", message: "id is required" };
      try {
        const message = await gmail.getMessage(id);
        return { message };
      } catch (e) {
        return { error: "get_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "gmail_send",
    description:
      "Send an email from the user's Gmail account. Returns { id, threadId } of the sent message.",
    parameterSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address(es), comma-separated." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Plain-text email body." },
        cc: { type: "array", items: { type: "string" }, description: "Optional Cc addresses." },
        bcc: { type: "array", items: { type: "string" }, description: "Optional Bcc addresses." },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "gmail",
    group: "Gmail",
    invoke: async (args) => {
      const to = String(args.to ?? "").trim();
      const subject = String(args.subject ?? "");
      const body = String(args.body ?? "");
      if (!to) return { error: "empty_to", message: "to is required" };
      if (!subject) return { error: "empty_subject", message: "subject is required" };
      if (!body) return { error: "empty_body", message: "body is required" };
      const cc = Array.isArray(args.cc) ? args.cc.map((x) => String(x)) : undefined;
      const bcc = Array.isArray(args.bcc) ? args.bcc.map((x) => String(x)) : undefined;
      try {
        const sent = await gmail.sendMessage({ to, subject, body, cc, bcc });
        return { id: sent.id, threadId: sent.threadId };
      } catch (e) {
        return { error: "send_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "gmail_draft",
    description:
      "Create a draft email in the user's Gmail account (does not send). Returns { draftId }.",
    parameterSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address(es), comma-separated." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Plain-text email body." },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "gmail",
    group: "Gmail",
    invoke: async (args) => {
      const to = String(args.to ?? "").trim();
      const subject = String(args.subject ?? "");
      const body = String(args.body ?? "");
      if (!to) return { error: "empty_to", message: "to is required" };
      if (!subject) return { error: "empty_subject", message: "subject is required" };
      if (!body) return { error: "empty_body", message: "body is required" };
      try {
        const draft = await gmail.createDraft({ to, subject, body });
        return { draftId: draft.draftId };
      } catch (e) {
        return { error: "draft_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "gmail_list_labels",
    description: "List the labels in the user's Gmail account. Returns { count, labels }.",
    parameterSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "gmail",
    group: "Gmail",
    invoke: async () => {
      try {
        const labels = await gmail.listLabels();
        return { count: labels.length, labels };
      } catch (e) {
        return { error: "labels_failed", message: String(e) };
      }
    },
  }),
];

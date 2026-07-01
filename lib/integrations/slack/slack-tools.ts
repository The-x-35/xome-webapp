"use client";

import { defineTool, type Tool, type ToolResult } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { slack, SlackError } from "@/lib/integrations/slack/slack-client";

/** Slack integration tools — all gated behind integrationId "slack". */

function handleError(e: unknown): ToolResult {
  if (e instanceof SlackError) {
    return { error: "slack_error", message: e.slackError };
  }
  return { error: "slack_failed", message: String(e) };
}

export const slackTools: Tool[] = [
  defineTool({
    name: "slack_send_message",
    description:
      "Send a message to a Slack channel, DM, or thread. The channel may be a channel id (Cxxx), a user id (Uxxx) for a direct message, or a #channel-name. Pass threadTs to reply in a thread.",
    parameterSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "Channel id (Cxxx), user id (Uxxx) for a DM, or #channel-name.",
        },
        text: { type: "string", description: "The message text to send." },
        threadTs: {
          type: "string",
          description: "Optional ts of a parent message to reply in its thread.",
        },
      },
      required: ["channel", "text"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "slack",
    group: "Slack",
    invoke: async (args): Promise<ToolResult> => {
      const channel = String(args.channel ?? "").trim();
      const text = String(args.text ?? "");
      if (!channel) return { error: "empty_channel", message: "channel is required" };
      if (!text) return { error: "empty_text", message: "text is required" };
      const threadTs = args.threadTs != null ? String(args.threadTs) : undefined;
      try {
        const res = await slack.sendMessage({ channel, text, threadTs });
        return { ts: res.ts, channel: res.channel };
      } catch (e) {
        return handleError(e);
      }
    },
  }),
  defineTool({
    name: "slack_search_messages",
    description:
      "Search Slack messages. Supports modifiers in the query such as from:@alice, in:#general, before:YYYY-MM-DD, after:YYYY-MM-DD, and has:link. Returns matching messages.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, optionally with Slack modifiers." },
        count: {
          type: "integer",
          description: "Max results 1–100 (default 20).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "slack",
    group: "Slack",
    invoke: async (args): Promise<ToolResult> => {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "empty_query", message: "query is required" };
      const count = Math.min(100, Math.max(1, Number(args.count ?? 20)));
      try {
        const res = await slack.searchMessages(query, count);
        return { count: res.total, messages: res.matches };
      } catch (e) {
        return handleError(e);
      }
    },
  }),
  defineTool({
    name: "slack_list_channels",
    description:
      "List Slack conversations the user has access to (public/private channels, DMs, and group DMs). Returns id, name, and is_private.",
    parameterSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max channels 1–1000 (default 100).",
        },
      },
      required: [],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "slack",
    group: "Slack",
    invoke: async (args): Promise<ToolResult> => {
      const limit = Math.min(1000, Math.max(1, Number(args.limit ?? 100)));
      try {
        const channels = await slack.listChannels(limit);
        return { count: channels.length, channels };
      } catch (e) {
        return handleError(e);
      }
    },
  }),
  defineTool({
    name: "slack_read_channel",
    description:
      "Read recent messages from a Slack channel or conversation by id. Returns the latest messages with user, text, and ts.",
    parameterSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "The conversation id (Cxxx / Dxxx / Gxxx)." },
        limit: {
          type: "integer",
          description: "Max messages 1–200 (default 30).",
        },
      },
      required: ["channelId"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "slack",
    group: "Slack",
    invoke: async (args): Promise<ToolResult> => {
      const channelId = String(args.channelId ?? "").trim();
      if (!channelId) return { error: "empty_channel", message: "channelId is required" };
      const limit = Math.min(200, Math.max(1, Number(args.limit ?? 30)));
      try {
        const messages = await slack.readChannel(channelId, limit);
        return { count: messages.length, messages };
      } catch (e) {
        return handleError(e);
      }
    },
  }),
];

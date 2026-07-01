"use client";

import { authedFetch } from "@/lib/integrations/oauth-client";

/**
 * Slack Web API client. All calls go through authedFetch("slack", …) so the
 * bearer token is attached server-side. The Slack Web API returns HTTP 200 even
 * on failures, with a JSON body of {ok:false, error}, so every call checks the
 * `ok` field and throws a SlackError carrying the Slack error code.
 */

const BASE = "https://slack.com/api";

export class SlackError extends Error {
  constructor(public readonly slackError: string) {
    super(slackError);
    this.name = "SlackError";
  }
}

interface SlackResponse {
  ok: boolean;
  error?: string;
}

async function call<T extends SlackResponse>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await authedFetch("slack", {
    url: `${BASE}/${method}`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const data = res.json<T>();
  if (!data || data.ok !== true) {
    throw new SlackError(data?.error ?? `slack_${method}_failed`);
  }
  return data;
}

export interface SendMessageArgs {
  channel: string;
  text: string;
  threadTs?: string;
}

export interface SendMessageResult {
  ts: string | undefined;
  channel: string | undefined;
}

export interface SearchMatch {
  channel: string | undefined;
  user: string | undefined;
  text: string | undefined;
  ts: string | undefined;
  permalink: string | undefined;
}

export interface SearchMessagesResult {
  total: number;
  matches: SearchMatch[];
}

export interface ChannelSummary {
  id: string | undefined;
  name: string | undefined;
  is_private: boolean | undefined;
}

export interface MessageSummary {
  user: string | undefined;
  text: string | undefined;
  ts: string | undefined;
}

interface PostMessageResponse extends SlackResponse {
  ts?: string;
  channel?: string;
}

interface SearchMessagesResponse extends SlackResponse {
  messages?: {
    total?: number;
    matches?: Array<{
      channel?: { id?: string; name?: string };
      user?: string;
      username?: string;
      text?: string;
      ts?: string;
      permalink?: string;
    }>;
  };
}

interface ConversationsListResponse extends SlackResponse {
  channels?: Array<{ id?: string; name?: string; is_private?: boolean }>;
}

interface ConversationsHistoryResponse extends SlackResponse {
  messages?: Array<{ user?: string; text?: string; ts?: string }>;
}

export class SlackClient {
  async sendMessage(args: SendMessageArgs): Promise<SendMessageResult> {
    const body: Record<string, unknown> = { channel: args.channel, text: args.text };
    if (args.threadTs) body.thread_ts = args.threadTs;
    const data = await call<PostMessageResponse>("chat.postMessage", body);
    return { ts: data.ts, channel: data.channel };
  }

  async searchMessages(query: string, count = 20): Promise<SearchMessagesResult> {
    const data = await call<SearchMessagesResponse>("search.messages", { query, count });
    const matches = (data.messages?.matches ?? []).map<SearchMatch>((m) => ({
      channel: m.channel?.name ?? m.channel?.id,
      user: m.username ?? m.user,
      text: m.text,
      ts: m.ts,
      permalink: m.permalink,
    }));
    return { total: data.messages?.total ?? matches.length, matches };
  }

  async listChannels(limit = 100): Promise<ChannelSummary[]> {
    const data = await call<ConversationsListResponse>("conversations.list", {
      limit,
      types: "public_channel,private_channel,im,mpim",
    });
    return (data.channels ?? []).map<ChannelSummary>((c) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
    }));
  }

  async readChannel(channelId: string, limit = 30): Promise<MessageSummary[]> {
    const data = await call<ConversationsHistoryResponse>("conversations.history", {
      channel: channelId,
      limit,
    });
    return (data.messages ?? []).map<MessageSummary>((m) => ({
      user: m.user,
      text: m.text,
      ts: m.ts,
    }));
  }
}

export const slack = new SlackClient();

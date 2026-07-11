"use client";

import type { Tool } from "@/lib/agent/tools/tool";
import { gmailTools } from "./gmail/gmail-tools";
import { calendarTools } from "./calendar/calendar-tools";
import { slackTools } from "./slack/slack-tools";
import { notionTools } from "./notion/notion-tools";
import { githubTools } from "./github/github-tools";
import { solanaTools } from "./solana/solana-tools";

export interface IntegrationDescriptor {
  id: string;
  label: string;
  tagline: string;
  /** Brand-ish hue used by the connections row icon tile. */
  tint: string;
  /** Connect flow: OAuth providers, Notion's pasted token, or Solana via Privy. */
  authKind: "google" | "slack" | "github" | "notion" | "solana";
  scopes: string[];
}

export const INTEGRATIONS: IntegrationDescriptor[] = [
  {
    id: "google",
    label: "Google",
    tagline: "Gmail & Calendar, read, draft, send, and schedule.",
    tint: "#4285F4",
    authKind: "google",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  {
    id: "slack",
    label: "Slack",
    tagline: "Post messages, search, read channels.",
    tint: "#611f69",
    authKind: "slack",
    scopes: [
      "chat:write",
      "channels:read",
      "channels:history",
      "groups:read",
      "groups:history",
      "im:read",
      "im:history",
      "mpim:read",
      "mpim:history",
      "search:read",
      "users:read",
    ],
  },
  {
    id: "notion",
    label: "Notion",
    tagline: "Search, read, and create pages.",
    tint: "#000000",
    authKind: "notion",
    scopes: [],
  },
  {
    id: "github",
    label: "GitHub",
    tagline: "Issues, PRs, code search, notifications.",
    tint: "#24292f",
    authKind: "github",
    scopes: ["repo", "read:user", "notifications"],
  },
  {
    id: "solana",
    label: "Solana",
    tagline: "Connect a wallet to check balances, send, and swap tokens.",
    tint: "#14F195",
    authKind: "solana",
    scopes: [],
  },
];

export function integrationById(id: string): IntegrationDescriptor | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

/** Build the agent Tools for the enabled OAuth integrations. */
export async function buildIntegrationTools(enabled: Set<string>): Promise<Tool[]> {
  const tools: Tool[] = [];
  if (enabled.has("gmail")) tools.push(...gmailTools);
  if (enabled.has("calendar")) tools.push(...calendarTools);
  if (enabled.has("slack")) tools.push(...slackTools);
  if (enabled.has("notion")) tools.push(...notionTools);
  if (enabled.has("github")) tools.push(...githubTools);
  if (enabled.has("solana")) tools.push(...solanaTools);
  return tools;
}

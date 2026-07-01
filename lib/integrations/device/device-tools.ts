"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";

/** On-device tools that have real browser equivalents — port of the
 *  browser-feasible subset of system_tools/media_tools/notification_tools. */

export const deviceTools: Tool[] = [
  defineTool({
    name: "clipboard_write",
    description: "Copy text to the user's clipboard.",
    parameterSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    consent: ConsentLevel.askOncePerSession,
    group: "Device",
    invoke: async (args) => {
      const text = String(args.text ?? "");
      try {
        await navigator.clipboard.writeText(text);
        return { ok: true, length: text.length };
      } catch (e) {
        return { error: "clipboard_denied", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "clipboard_read",
    description: "Read the current text contents of the user's clipboard.",
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    consent: ConsentLevel.askOncePerSession,
    group: "Device",
    invoke: async () => {
      try {
        const text = await navigator.clipboard.readText();
        return { text };
      } catch (e) {
        return { error: "clipboard_denied", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "location_get_current",
    description: "Get the user's current geographic location (latitude, longitude, accuracy). Prompts for permission.",
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    consent: ConsentLevel.askOncePerSession,
    group: "Device",
    invoke: () =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          resolve({ error: "unsupported", message: "Geolocation is not available." });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          (err) => resolve({ error: "location_denied", message: err.message }),
          { timeout: 10000 },
        );
      }),
  }),
  defineTool({
    name: "share_content",
    description: "Open the system share sheet with text and an optional URL (uses the Web Share API where available).",
    parameterSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
      },
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Device",
    invoke: async (args) => {
      const data = {
        text: args.text ? String(args.text) : undefined,
        url: args.url ? String(args.url) : undefined,
        title: args.title ? String(args.title) : undefined,
      };
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share(data);
          return { ok: true, shared: true };
        } catch (e) {
          return { error: "share_cancelled", message: String(e) };
        }
      }
      return { ok: false, shared: false, message: "Web Share not supported; nothing was shared." };
    },
  }),
  defineTool({
    name: "local_reminder_create",
    description: "Schedule a local browser notification at a future time. The tab should stay open for it to fire.",
    parameterSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        at: { type: "string", description: "ISO 8601 time to fire the reminder." },
      },
      required: ["title", "at"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    group: "Device",
    invoke: async (args) => {
      const title = String(args.title ?? "");
      const body = String(args.body ?? "");
      const at = new Date(String(args.at ?? ""));
      if (isNaN(at.getTime())) return { error: "bad_time", message: "`at` must be a valid ISO time." };
      const delay = at.getTime() - Date.now();
      if (delay < 0) return { error: "in_past", message: "Reminder time is in the past." };
      if (!("Notification" in window)) return { error: "unsupported", message: "Notifications unavailable." };
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") return { error: "permission_denied", message: "Notification permission denied." };
      setTimeout(() => {
        try { new Notification(title, { body }); } catch { /* ignore */ }
      }, Math.min(delay, 2 ** 31 - 1));
      return { ok: true, scheduledFor: at.toISOString() };
    },
  }),
];

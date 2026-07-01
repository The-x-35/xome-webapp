"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { calendar } from "@/lib/integrations/calendar/calendar-client";

/** Google Calendar tools. Reads are preApproved; writes are alwaysAsk. */

export const calendarTools: Tool[] = [
  defineTool({
    name: "calendar_list_events",
    description:
      "List upcoming Google Calendar events between an optional time range. Defaults to the next 7 days. Returns a compact list of events with id, summary, start, end, location, and attendees.",
    parameterSchema: {
      type: "object",
      properties: {
        timeMin: { type: "string", description: "Lower bound (ISO 8601 UTC). Defaults to now." },
        timeMax: { type: "string", description: "Upper bound (ISO 8601 UTC). Defaults to now + 7 days." },
        max: { type: "integer", description: "Max events 1–50 (default 10)." },
        calendarId: { type: "string", description: "Calendar id (default \"primary\")." },
      },
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "calendar",
    group: "Calendar",
    invoke: async (args) => {
      try {
        const max = Math.min(50, Math.max(1, Number(args.max ?? 10)));
        const events = await calendar.listEvents({
          timeMin: args.timeMin != null ? String(args.timeMin) : undefined,
          timeMax: args.timeMax != null ? String(args.timeMax) : undefined,
          max,
          calendarId: args.calendarId != null ? String(args.calendarId) : undefined,
        });
        return { count: events.length, events };
      } catch (e) {
        return { error: "list_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "calendar_create_event",
    description:
      "Create a new Google Calendar event. Start and end must be ISO 8601 date-times. Returns the created event id, htmlLink, and summary.",
    parameterSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start: { type: "string", description: "Start date-time (ISO 8601)." },
        end: { type: "string", description: "End date-time (ISO 8601)." },
        description: { type: "string", description: "Event description." },
        location: { type: "string", description: "Event location." },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Attendee email addresses.",
        },
      },
      required: ["summary", "start", "end"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "calendar",
    group: "Calendar",
    invoke: async (args) => {
      try {
        const summary = String(args.summary ?? "").trim();
        const start = String(args.start ?? "").trim();
        const end = String(args.end ?? "").trim();
        if (!summary || !start || !end) {
          return { error: "missing_fields", message: "summary, start, and end are required" };
        }
        const attendees = Array.isArray(args.attendees)
          ? (args.attendees as unknown[]).map((a) => String(a))
          : undefined;
        const result = await calendar.createEvent({
          summary,
          start,
          end,
          description: args.description != null ? String(args.description) : undefined,
          location: args.location != null ? String(args.location) : undefined,
          attendees,
        });
        return { id: result.id, htmlLink: result.htmlLink, summary: result.summary };
      } catch (e) {
        return { error: "create_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "calendar_update_event",
    description:
      "Update an existing Google Calendar event. Only the provided fields are changed. Returns the event id and updated:true.",
    parameterSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Id of the event to update." },
        summary: { type: "string", description: "New title." },
        start: { type: "string", description: "New start date-time (ISO 8601)." },
        end: { type: "string", description: "New end date-time (ISO 8601)." },
        description: { type: "string", description: "New description." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "calendar",
    group: "Calendar",
    invoke: async (args) => {
      try {
        const eventId = String(args.eventId ?? "").trim();
        if (!eventId) return { error: "missing_event_id", message: "eventId is required" };
        const updated = await calendar.updateEvent({
          eventId,
          summary: args.summary != null ? String(args.summary) : undefined,
          start: args.start != null ? String(args.start) : undefined,
          end: args.end != null ? String(args.end) : undefined,
          description: args.description != null ? String(args.description) : undefined,
        });
        return { id: updated.id ?? eventId, updated: true };
      } catch (e) {
        return { error: "update_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "calendar_delete_event",
    description: "Delete a Google Calendar event by id. Returns ok:true on success.",
    parameterSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Id of the event to delete." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "calendar",
    group: "Calendar",
    invoke: async (args) => {
      try {
        const eventId = String(args.eventId ?? "").trim();
        if (!eventId) return { error: "missing_event_id", message: "eventId is required" };
        await calendar.deleteEvent({ eventId });
        return { ok: true };
      } catch (e) {
        return { error: "delete_failed", message: String(e) };
      }
    },
  }),
];

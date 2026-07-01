"use client";

import { authedFetch } from "@/lib/integrations/oauth-client";

/** Google Calendar v3 client. All requests go through the integration proxy
 *  via authedFetch("calendar", …) so the user's token is attached server-side. */

const BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface RawCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: CalendarEventTime;
  end?: CalendarEventTime;
  attendees?: Array<{ email?: string }>;
}

export interface CompactEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: string[];
}

export interface ListEventsParams {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  max?: number;
}

export interface CreateEventParams {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  calendarId?: string;
}

export interface UpdateEventParams {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  calendarId?: string;
}

export interface DeleteEventParams {
  eventId: string;
  calendarId?: string;
}

function timeOf(t?: CalendarEventTime): string {
  return t?.dateTime ?? t?.date ?? "";
}

function compact(e: RawCalendarEvent): CompactEvent {
  return {
    id: e.id ?? "",
    summary: e.summary ?? "",
    start: timeOf(e.start),
    end: timeOf(e.end),
    location: e.location ?? "",
    attendees: (e.attendees ?? [])
      .map((a) => a.email ?? "")
      .filter((x) => x.length > 0),
  };
}

export class CalendarClient {
  async listEvents(params: ListEventsParams = {}): Promise<CompactEvent[]> {
    const calendarId = params.calendarId ?? "primary";
    const max = params.max ?? 10;
    const now = Date.now();
    const timeMin = params.timeMin ?? new Date(now).toISOString();
    const timeMax = params.timeMax ?? new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

    const qs = new URLSearchParams({
      maxResults: String(max),
      singleEvents: "true",
      orderBy: "startTime",
      timeMin,
      timeMax,
    });
    const res = await authedFetch("calendar", {
      url: `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
    });
    if (!res.ok) throw new Error(res.text || `List events failed (${res.status})`);
    const data = res.json<{ items?: RawCalendarEvent[] }>();
    return (data.items ?? []).map(compact);
  }

  async createEvent(params: CreateEventParams): Promise<{ id: string; htmlLink: string; summary: string }> {
    const calendarId = params.calendarId ?? "primary";
    const body: Record<string, unknown> = {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start },
      end: { dateTime: params.end },
      attendees: (params.attendees ?? []).map((email) => ({ email })),
    };
    const res = await authedFetch("calendar", {
      url: `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!res.ok) throw new Error(res.text || `Create event failed (${res.status})`);
    const e = res.json<RawCalendarEvent>();
    return { id: e.id ?? "", htmlLink: e.htmlLink ?? "", summary: e.summary ?? "" };
  }

  async updateEvent(params: UpdateEventParams): Promise<RawCalendarEvent> {
    const calendarId = params.calendarId ?? "primary";
    const body: Record<string, unknown> = {};
    if (params.summary !== undefined) body.summary = params.summary;
    if (params.description !== undefined) body.description = params.description;
    if (params.start !== undefined) body.start = { dateTime: params.start };
    if (params.end !== undefined) body.end = { dateTime: params.end };
    const res = await authedFetch("calendar", {
      url: `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!res.ok) throw new Error(res.text || `Update event failed (${res.status})`);
    return res.json<RawCalendarEvent>();
  }

  async deleteEvent(params: DeleteEventParams): Promise<{ ok: true }> {
    const calendarId = params.calendarId ?? "primary";
    const res = await authedFetch("calendar", {
      url: `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
      method: "DELETE",
    });
    if (!res.ok) throw new Error(res.text || `Delete event failed (${res.status})`);
    return { ok: true };
  }
}

export const calendar = new CalendarClient();

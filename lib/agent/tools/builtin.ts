import { defineTool, type Tool } from "./tool";
import { ConsentLevel } from "./consent";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Port of builtin_tools.dart, get_current_time. */
export const builtinTools: Tool[] = [
  defineTool({
    name: "get_current_time",
    description:
      "Returns the current local date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS) along with the day of the week and timezone. Call this whenever the user asks what time/day it is or anything that depends on the current moment.",
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    consent: ConsentLevel.preApproved,
    group: "Utilities",
    invoke: async () => {
      const now = new Date();
      const off = -now.getTimezoneOffset();
      const sign = off >= 0 ? "+" : "-";
      const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
      const mm = String(Math.abs(off) % 60).padStart(2, "0");
      return {
        iso: now.toISOString(),
        local: now.toString(),
        dayOfWeek: WEEKDAYS[now.getDay()],
        timezoneOffset: `${sign}${hh}:${mm}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    },
  }),

  defineTool({
    name: "plan_update",
    description:
      "Show/update your execution plan as a visible checklist. For any task needing 3+ steps, call this FIRST with all steps as 'pending', then call it again as you finish each step (mark 'done'). Always pass the FULL list every time.",
    parameterSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "The complete plan. Each step: { label, status }.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short step description." },
              status: { type: "string", enum: ["pending", "active", "done"], description: "Step state." },
            },
            required: ["label", "status"],
          },
        },
      },
      required: ["steps"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Utilities",
    invoke: async (args) => {
      const raw = Array.isArray(args.steps) ? (args.steps as unknown[]) : [];
      const steps = raw
        .map((s) => {
          const o = s as { label?: unknown; status?: unknown };
          const status = o.status === "done" || o.status === "active" ? o.status : "pending";
          return { label: String(o.label ?? "").slice(0, 120), status };
        })
        .filter((s) => s.label);
      if (!steps.length) return { error: "empty_plan", message: "steps is required" };
      return { ok: true, steps };
    },
  }),

  defineTool({
    name: "present_artifact",
    description:
      "Present a complete document to the user as a downloadable artifact with preview (report, code file, table, web page). Use for any substantial standalone output instead of pasting it into chat. type: 'markdown' | 'html' | 'csv' | 'code' | 'text'.",
    parameterSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short document title, e.g. 'Q3 report'." },
        type: { type: "string", enum: ["markdown", "html", "csv", "code", "text"], description: "Content type." },
        content: { type: "string", description: "The full document content." },
        filename: { type: "string", description: "Suggested filename incl. extension (optional)." },
      },
      required: ["title", "type", "content"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Utilities",
    invoke: async (args) => {
      const title = String(args.title ?? "").trim() || "Document";
      const type = ["markdown", "html", "csv", "code", "text"].includes(String(args.type)) ? String(args.type) : "text";
      const content = String(args.content ?? "");
      if (!content.trim()) return { error: "empty", message: "content is required" };
      const ext = { markdown: "md", html: "html", csv: "csv", code: "txt", text: "txt" }[type as "markdown"];
      const filename = String(args.filename ?? "").trim() || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${ext}`;
      return { ok: true, artifact: { title, type, content, filename } };
    },
  }),
];

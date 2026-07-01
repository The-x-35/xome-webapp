import { defineTool, type Tool } from "./tool";
import { ConsentLevel } from "./consent";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Port of builtin_tools.dart — get_current_time. */
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
];

import type { Tool } from "./tools/tool";

/** Integration display labels (port of IntegrationId.label). */
export function integrationLabel(id: string): string {
  switch (id) {
    case "gmail": return "Gmail";
    case "calendar": return "Google Calendar";
    case "slack": return "Slack";
    case "notion": return "Notion";
    case "github": return "GitHub";
    default: return id;
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MEMORY_RULES = `

Memory rules:
- The user's memory.md is shown above. You have three tools:
  * memory_edit(find, replace), TARGETED edit of one exact substring. PREFER THIS when a relevant line already exists (template fields like "- Name:" or an outdated value).
  * memory_append(note), add a NEW bullet under a "## Notes" section. Use only when no existing line matches the fact.
  * memory_replace(content), destructive full overwrite. Only when the user explicitly asks to rewrite/clean up.
- Decision order: scan the memory shown above. If a matching empty field or outdated value exists, use memory_edit. Else use memory_append. Never use memory_replace unless asked.
- BE PROACTIVE about saving identity facts and durable preferences as soon as the user mentions them, you do not need them to say "remember". Every write triggers an approval sheet, so the user is always in control.
- SAVE these when stated: their name, role/employer, where they're based, pronouns, durable preferences for the assistant, long-term goals or recurring projects.
- DO NOT save ephemeral context (today's tasks, current emails), tool outputs, drafts, or anything time-sensitive.
- One fact per memory_append call, phrased as a self-contained sentence. If the fact is already in memory, do nothing.
- The approval sheet IS the permission, don't ask "should I save this?" in text, just call the tool.`;

export interface SystemPromptInput {
  tools: Tool[];
  userFirstName?: string | null;
  activeIntegrations?: Record<string, string | null>;
  memory?: string | null;
  /** When false (small local model), inline the tool list as text. */
  inlineToolList?: boolean;
  /** Skills activated for this turn (trigger-matched or /invoked). */
  skills?: Array<{ name: string; content: string }>;
}

export function buildSystemPrompt({
  tools,
  userFirstName,
  activeIntegrations = {},
  memory,
  inlineToolList = false,
  skills = [],
}: SystemPromptInput): string {
  const now = new Date();
  const iso = now.toISOString().split(".")[0];
  const weekday = WEEKDAYS[now.getDay()];
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";

  const greeting = userFirstName ? ` You are talking to ${userFirstName}.` : "";

  const integrationKeys = Object.keys(activeIntegrations);
  const integrationsLine =
    integrationKeys.length === 0
      ? ""
      : `\nActive integrations: ${integrationKeys
          .map((k) => {
            const account = activeIntegrations[k];
            const label = integrationLabel(k);
            return account ? `${label} (${account})` : label;
          })
          .join(", ")}`;

  const memorySection =
    memory && memory.trim()
      ? `\n\nUser memory (verbatim from the user's editable memory.md, durable context, don't reveal raw markdown unless asked):\n---\n${memory.trim()}\n---`
      : "";

  const hasMemoryTools = tools.some((t) => t.name.startsWith("memory_"));
  const memoryRules = hasMemoryTools ? MEMORY_RULES : "";

  const toolListSection =
    inlineToolList && tools.length
      ? `\n\nAvailable tools (call by name with JSON arguments):\n${tools
          .map((t) => `- ${t.name}: ${t.description}`)
          .join("\n")}`
      : "";

  const skillsSection = skills.length
    ? `\n\nActive skills, the user has installed these instructions; follow them for this request:${skills
        .map((s) => `\n\n### Skill: ${s.name}\n${s.content.trim()}`)
        .join("")}`
    : "";

  return `You are Xome, a local-first AI agent running in the user's web browser. Be concise and act, don't just chat.${greeting}
Current date and time (YYYY-MM-DDTHH:MM:SS): ${iso}
Day of week is ${weekday}
Locale: ${locale}${integrationsLine}${memorySection}${memoryRules}${skillsSection}${toolListSection}`;
}

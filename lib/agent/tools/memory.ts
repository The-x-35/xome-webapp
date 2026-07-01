import { defineTool, type Tool } from "./tool";
import { ConsentLevel } from "./consent";
import { readMemory, writeMemory } from "@/lib/store/memory";

/** Append a bullet under a "## Notes" section (creating it if absent). */
function appendNote(existing: string, note: string): string {
  const bullet = `- ${note.replace(/^[-*]\s*/, "")}`;
  if (/##\s*Notes/i.test(existing)) {
    return existing.replace(/(##\s*Notes\s*\n)/i, `$1${bullet}\n`);
  }
  const sep = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${sep}\n## Notes\n${bullet}\n`;
}

/** Port of memory_tools.dart — memory_append / memory_edit / memory_replace. */
export const memoryTools: Tool[] = [
  defineTool({
    name: "memory_append",
    description:
      "FALLBACK tool — adds a NEW bullet under a \"## Notes\" section in memory.md. Only call this when no existing template field fits the fact. If an empty/outdated field matches (e.g. \"- Name:\"), use memory_edit instead. Good uses: free-form facts with no matching field (\"User enjoys sci-fi novels\").",
    parameterSchema: {
      type: "object",
      properties: { note: { type: "string", description: "A single, self-contained fact or preference. No leading bullet — the tool adds one." } },
      required: ["note"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    group: "Memory",
    invoke: async (args) => {
      const note = String(args.note ?? "").trim();
      if (!note) return { error: "empty_note", message: "note must be non-empty" };
      const existing = await readMemory();
      const updated = appendNote(existing, note);
      await writeMemory(updated);
      return { ok: true, note_added: note, memory_length_chars: updated.length };
    },
  }),
  defineTool({
    name: "memory_edit",
    description:
      "PRIMARY tool for updating user memory. Replaces ONE exact occurrence of a string in memory.md. Use whenever a relevant line already exists — especially empty template fields like \"- Name:\". The `find` value must appear EXACTLY ONCE; include enough surrounding text to be unique. Fails if not found or non-unique. Prefer this over memory_append when a matching field exists.",
    parameterSchema: {
      type: "object",
      properties: {
        find: { type: "string", description: "Exact unique substring to locate (e.g. \"- Name:\")." },
        replace: { type: "string", description: "Text to substitute for `find`." },
      },
      required: ["find", "replace"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    group: "Memory",
    invoke: async (args) => {
      const find = String(args.find ?? "");
      const replace = String(args.replace ?? "");
      if (!find) return { error: "empty_find", message: "find must be non-empty" };
      const existing = await readMemory();
      const first = existing.indexOf(find);
      if (first === -1) return { error: "not_found", message: "find string did not appear in memory.md" };
      if (existing.indexOf(find, first + 1) !== -1)
        return { error: "not_unique", message: "find string appears more than once — add surrounding context" };
      const updated = existing.slice(0, first) + replace + existing.slice(first + find.length);
      await writeMemory(updated);
      return { ok: true, memory_length_chars: updated.length };
    },
  }),
  defineTool({
    name: "memory_replace",
    description:
      "OVERWRITE the user's entire memory.md with new content. Destructive — use only when the user explicitly asks to rewrite/clean up/reorganize their memory. Never use this to \"add\" (that's memory_append). Plain markdown with \"##\" headers.",
    parameterSchema: {
      type: "object",
      properties: { content: { type: "string", description: "Full new content of memory.md (markdown)." } },
      required: ["content"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    group: "Memory",
    invoke: async (args) => {
      const content = String(args.content ?? "");
      if (!content.trim()) return { error: "empty_content", message: "content must be non-empty" };
      await writeMemory(content);
      return { ok: true, memory_length_chars: content.length };
    },
  }),
];

"use client";

import { db, uid, type SkillRecord } from "./db";
import { emit } from "./bus";

/**
 * Skills store — user-authored SKILL.md-style extensions kept in IndexedDB.
 * A skill is frontmatter (name, description, triggers) + a markdown body of
 * instructions. Matched skills are injected into the system prompt; a skill
 * can also be invoked explicitly with /name in the composer.
 */

export async function listSkills(): Promise<SkillRecord[]> {
  const all = await (await db()).getAll("skills");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkill(id: string): Promise<SkillRecord | undefined> {
  return (await db()).get("skills", id);
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function saveSkill(
  skill: Omit<SkillRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<SkillRecord> {
  const existing = skill.id ? await getSkill(skill.id) : undefined;
  const rec: SkillRecord = {
    id: skill.id ?? uid(),
    name: slugify(skill.name) || "skill",
    description: skill.description.trim(),
    triggers: skill.triggers.map((t) => t.trim().toLowerCase()).filter(Boolean),
    content: skill.content,
    enabled: skill.enabled,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await (await db()).put("skills", rec);
  emit("skills");
  return rec;
}

export async function deleteSkill(id: string): Promise<void> {
  await (await db()).delete("skills", id);
  emit("skills");
}

// ── SKILL.md import/export ─────────────────────────────────────────────────────

/** Serialize to the portable SKILL.md format (YAML frontmatter + body). */
export function toSkillMd(s: SkillRecord): string {
  const triggers = s.triggers.length ? `\ntriggers: [${s.triggers.map((t) => JSON.stringify(t)).join(", ")}]` : "";
  return `---\nname: ${s.name}\ndescription: ${s.description}${triggers}\n---\n\n${s.content.trim()}\n`;
}

/** Parse a SKILL.md file (tolerant: missing frontmatter → name from filename). */
export function parseSkillMd(text: string, fallbackName = "imported-skill"): {
  name: string;
  description: string;
  triggers: string[];
  content: string;
} {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { name: slugify(fallbackName), description: "", triggers: [], content: text.trim() };
  const [, fm, body] = m;
  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
  const rawTriggers = get("triggers");
  const triggers = rawTriggers
    ? rawTriggers
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, "").toLowerCase())
        .filter(Boolean)
    : [];
  return {
    name: slugify(get("name") || fallbackName),
    description: get("description").replace(/^["']|["']$/g, ""),
    triggers,
    content: body.trim(),
  };
}

// ── Matching ───────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "my",
  "me", "i", "you", "is", "it", "this", "that", "please", "can", "do",
]);

/**
 * Pick the skills relevant to a user message. Explicit trigger phrases win;
 * otherwise score by word overlap with name + description. Mirrors the app's
 * lexical tool_selector approach — cheap, deterministic, no model call.
 */
export function matchSkills(input: string, skills: SkillRecord[], max = 2): SkillRecord[] {
  const text = input.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));

  const scored = skills
    .filter((s) => s.enabled)
    .map((s) => {
      let score = 0;
      for (const t of s.triggers) if (t && text.includes(t)) score += 10;
      const hay = `${s.name.replace(/-/g, " ")} ${s.description}`.toLowerCase();
      const hayWords = new Set(hay.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
      for (const w of words) if (hayWords.has(w)) score += 1;
      return { s, score };
    })
    .filter((e) => e.score >= 2)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((e) => e.s);
}

/** If the message starts with /skill-name, return that skill + the remainder. */
export function parseSlashSkill(
  input: string,
  skills: SkillRecord[],
): { skill: SkillRecord; rest: string } | null {
  const m = input.match(/^\/([a-z0-9-]+)\s*([\s\S]*)$/i);
  if (!m) return null;
  const skill = skills.find((s) => s.enabled && s.name === m[1].toLowerCase());
  return skill ? { skill, rest: m[2].trim() } : null;
}

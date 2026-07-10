"use client";

import { db } from "./db";

/**
 * Editable user memory (memory.md) — the durable context surfaced in the system
 * prompt and mutated by the memory_* tools. Port of memory_store.dart.
 */

const ID = "memory";

export const DEFAULT_MEMORY = `# About me

- Name:
- Role / occupation:
- Where I'm based:
- How to address me (pronouns):
- Tone I prefer:

## Notes
`;

export async function readMemory(): Promise<string> {
  const rec = await (await db()).get("memory", ID);
  return rec?.content ?? DEFAULT_MEMORY;
}

let undoSnapshot: string | null = null;

export async function writeMemory(content: string): Promise<void> {
  // Keep the previous content so the last change can be undone (undo toast).
  try {
    undoSnapshot = await readMemory();
  } catch {
    undoSnapshot = null;
  }
  await (await db()).put("memory", { id: ID, content, updatedAt: Date.now() });
}

/** Restore memory to what it was before the most recent write. */
export async function undoMemoryChange(): Promise<boolean> {
  if (undoSnapshot == null) return false;
  const prev = undoSnapshot;
  undoSnapshot = null;
  await (await db()).put("memory", { id: ID, content: prev, updatedAt: Date.now() });
  return true;
}

export async function resetMemory(): Promise<void> {
  await writeMemory(DEFAULT_MEMORY);
}

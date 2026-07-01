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

export async function writeMemory(content: string): Promise<void> {
  await (await db()).put("memory", { id: ID, content, updatedAt: Date.now() });
}

export async function resetMemory(): Promise<void> {
  await writeMemory(DEFAULT_MEMORY);
}

"use client";

import { db, uid, type McpServerRecord } from "./db";

export async function listMcpServers(): Promise<McpServerRecord[]> {
  return (await db()).getAll("mcpServers");
}

export async function saveMcpServer(
  rec: Omit<McpServerRecord, "id" | "updatedAt"> & { id?: string },
): Promise<McpServerRecord> {
  const full: McpServerRecord = {
    id: rec.id ?? uid(),
    name: rec.name,
    url: rec.url,
    bearerToken: rec.bearerToken ?? null,
    enabled: rec.enabled,
    tools: rec.tools ?? [],
    status: rec.status ?? "unknown",
    lastError: rec.lastError ?? null,
    updatedAt: Date.now(),
  };
  await (await db()).put("mcpServers", full);
  return full;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await (await db()).delete("mcpServers", id);
}

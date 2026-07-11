"use client";

import { db, uid, type WorkspaceRecord } from "./db";
import { getPrefs, setPrefs } from "./prefs";
import { emit } from "./bus";

/**
 * Workspaces, lightweight project containers that group tasks/conversations.
 * A virtual "Personal" workspace (id "default") always exists and needs no row
 * in the store; conversations without a workspaceId belong to it.
 */

export const DEFAULT_WORKSPACE_ID = "default";

const DEFAULT_WS: WorkspaceRecord = {
  id: DEFAULT_WORKSPACE_ID,
  name: "Personal",
  createdAt: 0,
  updatedAt: 0,
};

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const stored = await (await db()).getAll("workspaces");
  return [DEFAULT_WS, ...stored.sort((a, b) => a.createdAt - b.createdAt)];
}

export function activeWorkspaceId(): string {
  return getPrefs().activeWorkspaceId ?? DEFAULT_WORKSPACE_ID;
}

export function setActiveWorkspace(id: string): void {
  setPrefs({ activeWorkspaceId: id });
  emit("workspaces");
}

export async function createWorkspace(name: string): Promise<WorkspaceRecord> {
  const rec: WorkspaceRecord = {
    id: uid(),
    name: name.trim().slice(0, 40) || "Workspace",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await (await db()).put("workspaces", rec);
  emit("workspaces");
  return rec;
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  if (id === DEFAULT_WORKSPACE_ID) return;
  const d = await db();
  const rec = await d.get("workspaces", id);
  if (!rec) return;
  rec.name = name.trim().slice(0, 40) || rec.name;
  rec.updatedAt = Date.now();
  await d.put("workspaces", rec);
  emit("workspaces");
}

/** Delete a workspace; its tasks move to the default workspace. */
export async function deleteWorkspace(id: string): Promise<void> {
  if (id === DEFAULT_WORKSPACE_ID) return;
  const d = await db();
  await d.delete("workspaces", id);
  const convos = await d.getAll("conversations");
  for (const c of convos) {
    if (c.workspaceId === id) {
      c.workspaceId = undefined;
      await d.put("conversations", c);
    }
  }
  // Live runs hold an in-memory convo snapshot, untag those too, or their
  // next persist would resurrect the deleted workspace id.
  const { clearWorkspaceTag } = await import("@/lib/agent/run-manager");
  clearWorkspaceTag(id);
  if (activeWorkspaceId() === id) setPrefs({ activeWorkspaceId: DEFAULT_WORKSPACE_ID });
  emit("workspaces");
  emit("conversations");
}

/** Does a conversation belong to a workspace? */
export function inWorkspace(convoWorkspaceId: string | undefined, wsId: string): boolean {
  return (convoWorkspaceId ?? DEFAULT_WORKSPACE_ID) === wsId;
}

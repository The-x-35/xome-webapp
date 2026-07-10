"use client";

import { db } from "@/lib/store/db";
import { emit } from "@/lib/store/bus";

/**
 * Local folder workspace — the browser analogue of Cowork/OpenWork's
 * agent-on-your-files loop, built on the File System Access API (Chromium).
 * The user picks a folder; the agent gets scoped, permissioned read/write
 * inside it and nowhere else. The handle persists in IndexedDB across reloads
 * (the browser re-prompts for permission per session).
 */

// The File System Access picker + permission methods aren't in TS's lib.dom yet.
interface DirPickerWindow extends Window {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}
interface PermissionedHandle extends FileSystemDirectoryHandle {
  queryPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  values?: () => AsyncIterableIterator<FileSystemHandle>;
}

const HANDLE_ID = "workspace";
let current: FileSystemDirectoryHandle | null = null;

export function isWorkspaceSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as DirPickerWindow).showDirectoryPicker === "function";
}

export function getWorkspaceSync(): FileSystemDirectoryHandle | null {
  return current;
}

/** Restore the persisted handle, re-requesting permission if needed. */
export async function restoreWorkspace(requestIfNeeded = false): Promise<FileSystemDirectoryHandle | null> {
  if (current) return current;
  try {
    const rec = await (await db()).get("handles", HANDLE_ID);
    if (!rec) return null;
    const h = rec.handle as PermissionedHandle;
    const q = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (q === "granted") {
      current = rec.handle;
      return current;
    }
    if (requestIfNeeded) {
      const r = await h.requestPermission?.({ mode: "readwrite" });
      if (r === "granted") {
        current = rec.handle;
        return current;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Open the folder picker and set the workspace. */
export async function connectWorkspace(): Promise<string | null> {
  const picker = (window as DirPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This browser doesn't support folder access. Use Chrome or Edge.");
  const handle = await picker({ mode: "readwrite" });
  current = handle;
  await (await db()).put("handles", { id: HANDLE_ID, handle, name: handle.name });
  emit("connections");
  return handle.name;
}

export async function disconnectWorkspace(): Promise<void> {
  current = null;
  await (await db()).delete("handles", HANDLE_ID);
  emit("connections");
}

export async function workspaceName(): Promise<string | null> {
  if (current) return current.name;
  const rec = await (await db()).get("handles", HANDLE_ID);
  return rec?.name ?? null;
}

// ── Path helpers (scoped inside the workspace; no traversal) ──────────────────

function splitPath(path: string): string[] {
  const parts = path.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p === "..")) throw new Error("Path traversal is not allowed");
  return parts.filter((p) => p !== ".");
}

async function dirAt(root: FileSystemDirectoryHandle, parts: string[], create = false): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return dir;
}

export async function requireWorkspace(): Promise<FileSystemDirectoryHandle> {
  const h = (await restoreWorkspace(true)) ?? current;
  if (!h) throw new Error("No workspace folder connected. Connect one under Connections → Local folder.");
  return h;
}

export interface WsEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
}

export async function listDir(path = ""): Promise<WsEntry[]> {
  const root = await requireWorkspace();
  const parts = splitPath(path);
  const dir = (await dirAt(root, parts)) as PermissionedHandle;
  const out: WsEntry[] = [];
  const iter = dir.values?.();
  if (!iter) return out;
  for await (const h of iter) {
    out.push({ name: h.name, kind: h.kind, path: [...parts, h.name].join("/") });
    if (out.length >= 200) break;
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1));
}

export async function readFileText(path: string, maxChars = 24000): Promise<{ content: string; truncated: boolean; size: number }> {
  const root = await requireWorkspace();
  const parts = splitPath(path);
  const name = parts.pop();
  if (!name) throw new Error("path is required");
  const dir = await dirAt(root, parts);
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  const text = await file.text();
  return { content: text.slice(0, maxChars), truncated: text.length > maxChars, size: file.size };
}

export async function writeFileText(path: string, content: string): Promise<{ path: string; bytes: number }> {
  const root = await requireWorkspace();
  const parts = splitPath(path);
  const name = parts.pop();
  if (!name) throw new Error("path is required");
  const dir = await dirAt(root, parts, true);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
  return { path, bytes: new Blob([content]).size };
}

/** Recursive filename search (bounded), plus optional shallow content match. */
export async function searchWorkspace(query: string, maxResults = 30): Promise<WsEntry[]> {
  const root = await requireWorkspace();
  const q = query.toLowerCase();
  const out: WsEntry[] = [];
  const walk = async (dir: PermissionedHandle, prefix: string[], depth: number) => {
    if (out.length >= maxResults || depth > 5) return;
    const iter = dir.values?.();
    if (!iter) return;
    for await (const h of iter) {
      if (out.length >= maxResults) return;
      const path = [...prefix, h.name].join("/");
      if (h.name.toLowerCase().includes(q)) out.push({ name: h.name, kind: h.kind, path });
      if (h.kind === "directory" && !h.name.startsWith(".") && h.name !== "node_modules") {
        await walk(h as PermissionedHandle, [...prefix, h.name], depth + 1);
      }
    }
  };
  await walk(root as PermissionedHandle, [], 0);
  return out;
}

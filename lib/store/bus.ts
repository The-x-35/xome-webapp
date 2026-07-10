"use client";

/** Tiny cross-component event bus for store mutations (conversations changed,
 *  connections changed) so the sidebar / lists refresh without prop drilling. */

type Topic = "conversations" | "connections" | "prefs" | "skills" | "runs" | "workspaces";

export function emit(topic: Topic): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(`xome:${topic}`));
  }
}

export function on(topic: Topic, fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => fn();
  window.addEventListener(`xome:${topic}`, h);
  return () => window.removeEventListener(`xome:${topic}`, h);
}

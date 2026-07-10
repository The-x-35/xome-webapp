"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@/components/ui/index";
import { IconChevron, IconPlus, IconTrash } from "@/components/chrome/icons";
import type { SkillRecord } from "@/lib/store/db";
import { listSkills, saveSkill, deleteSkill, parseSkillMd, toSkillMd, slugify } from "@/lib/store/skills";

const EMPTY = { name: "", description: "", triggers: "", content: "", enabled: true };

export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => listSkills().then(setSkills).catch(() => {}), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const startEdit = (s?: SkillRecord) =>
    setEditing(
      s
        ? { id: s.id, name: s.name, description: s.description, triggers: s.triggers.join(", "), content: s.content, enabled: s.enabled }
        : { ...EMPTY },
    );

  const save = async () => {
    if (!editing || !editing.name.trim() || !editing.content.trim()) return;
    await saveSkill({
      id: editing.id,
      name: editing.name,
      description: editing.description,
      triggers: editing.triggers.split(",").map((t) => t.trim()).filter(Boolean),
      content: editing.content,
      enabled: editing.enabled,
    });
    setEditing(null);
    refresh();
  };

  const importMd = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const parsed = parseSkillMd(await f.text(), f.name.replace(/\.md$/i, ""));
      await saveSkill({ ...parsed, enabled: true });
    }
    refresh();
  };

  const exportMd = (s: SkillRecord) => {
    const blob = new Blob([toSkillMd(s)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${s.name}.SKILL.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const [shared, setShared] = useState<string | null>(null);
  const shareLink = (s: SkillRecord) => {
    const payload = JSON.stringify({ name: s.name, description: s.description, triggers: s.triggers, content: s.content });
    const b64 = btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = `${window.location.origin}/skill#${b64}`;
    void navigator.clipboard?.writeText(url);
    setShared(s.id);
    setTimeout(() => setShared(null), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2">
            <IconChevron width={18} height={18} className="rotate-180 text-text-2" />
          </button>
          <h1 className="font-display text-2xl font-medium tracking-[-0.01em]">Skills</h1>
          <div className="flex-1" />
          <input ref={fileRef} type="file" accept=".md" multiple hidden onChange={(e) => importMd(e.target.files)} />
          <Button variant="outlined" className="!px-3.5 !py-2 text-[13px]" onClick={() => fileRef.current?.click()}>
            Import .md
          </Button>
          <Button className="!px-3.5 !py-2 text-[13px]" onClick={() => startEdit()}>
            <IconPlus width={14} height={14} /> New skill
          </Button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-text-2">
          Teach Xome repeatable workflows in plain Markdown. A skill activates when a message matches its trigger
          phrases, or explicitly with <span className="font-mono text-[12px]">/skill-name</span> in the chat. Stored
          only in this browser; portable as SKILL.md files.
        </p>

        {editing && (
          <div className="mt-5 rounded-[var(--radius-card)] border border-accent bg-surface p-4">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12.5px] text-text-2">
                  Name (slug — becomes /{slugify(editing.name) || "name"})
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="meeting-notes"
                    className="mt-1 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
                  />
                </label>
                <label className="text-[12.5px] text-text-2">
                  Trigger phrases (comma-separated)
                  <input
                    value={editing.triggers}
                    onChange={(e) => setEditing({ ...editing, triggers: e.target.value })}
                    placeholder="meeting notes, summarize meeting"
                    className="mt-1 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
                  />
                </label>
              </div>
              <label className="text-[12.5px] text-text-2">
                Description (one line — also used for matching)
                <input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Turn raw notes into structured meeting minutes"
                  className="mt-1 w-full rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
              </label>
              <label className="text-[12.5px] text-text-2">
                Instructions (Markdown, injected when the skill activates)
                <textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={8}
                  placeholder={"When the user shares meeting notes:\n1. Extract decisions and owners\n2. List action items with deadlines\n3. Keep it under 200 words"}
                  className="mt-1 w-full resize-y rounded-[10px] border border-border bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                className="!px-4 !py-2 text-[13px]"
                disabled={!editing.name.trim() || !editing.content.trim()}
                onClick={save}
              >
                Save skill
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {skills.length === 0 && !editing && (
            <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center text-[13.5px] text-text-2">
              No skills yet. Create one, or import a SKILL.md file.
            </div>
          )}
          {skills.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[13.5px] font-medium text-text">/{s.name}</span>
                {s.enabled ? <Tag kind="success" dot>On</Tag> : <Tag kind="neutral">Off</Tag>}
                <div className="flex-1" />
                <Button
                  variant="text"
                  className="!px-2 !py-1 text-[12.5px]"
                  onClick={async () => {
                    await saveSkill({ ...s, triggers: s.triggers, enabled: !s.enabled });
                    refresh();
                  }}
                >
                  {s.enabled ? "Disable" : "Enable"}
                </Button>
                <Button variant="text" className="!px-2 !py-1 text-[12.5px]" onClick={() => shareLink(s)}>
                  {shared === s.id ? "Copied!" : "Share"}
                </Button>
                <Button variant="text" className="!px-2 !py-1 text-[12.5px]" onClick={() => exportMd(s)}>
                  Export
                </Button>
                <Button variant="text" className="!px-2 !py-1 text-[12.5px]" onClick={() => startEdit(s)}>
                  Edit
                </Button>
                <Button
                  variant="text"
                  className="!px-2 !py-1 text-[12.5px] text-danger"
                  onClick={async () => {
                    if (confirm(`Delete /${s.name}?`)) {
                      await deleteSkill(s.id);
                      refresh();
                    }
                  }}
                >
                  <IconTrash width={13} height={13} />
                </Button>
              </div>
              {s.description && <p className="mt-1.5 text-[13px] text-text-2">{s.description}</p>}
              {s.triggers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.triggers.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-text-3">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

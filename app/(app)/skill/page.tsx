"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@/components/ui/index";
import { Mark } from "@/components/ui/mark";
import { saveSkill, listSkills } from "@/lib/store/skills";

interface SharedSkill {
  name: string;
  description: string;
  triggers: string[];
  content: string;
}

/** Landing page for shared skill links: /skill#<base64url(json)>. The payload
 *  never touches a server — it lives entirely in the URL fragment. */
export default function SkillSharePage() {
  const router = useRouter();
  const [skill, setSkill] = useState<SharedSkill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) {
        setError("No skill data in this link.");
        return;
      }
      const json = atob(hash.replace(/-/g, "+").replace(/_/g, "/"));
      const parsed = JSON.parse(json) as SharedSkill;
      if (!parsed.name || !parsed.content) {
        setError("This link doesn't contain a valid skill.");
        return;
      }
      setSkill({
        name: String(parsed.name),
        description: String(parsed.description ?? ""),
        triggers: Array.isArray(parsed.triggers) ? parsed.triggers.map(String) : [],
        content: String(parsed.content),
      });
      listSkills().then((all) => setExists(all.some((s) => s.name === parsed.name)));
    } catch {
      setError("Couldn't read this skill link.");
    }
  }, []);

  const add = async () => {
    if (!skill) return;
    await saveSkill({ ...skill, enabled: true });
    setAdded(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center gap-2.5">
          <Mark size={28} className="text-ink" />
          <h1 className="font-display text-2xl font-medium tracking-[-0.01em]">Shared skill</h1>
        </div>

        {error && <p className="mt-6 text-[14px] text-danger">{error}</p>}

        {skill && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[16px] font-medium text-text">/{skill.name}</span>
              {exists && <Tag kind="warning">Replaces your existing /{skill.name}</Tag>}
            </div>
            {skill.description && <p className="mt-2 text-[14px] text-text-2">{skill.description}</p>}
            {skill.triggers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skill.triggers.map((t) => (
                  <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-text-3">{t}</span>
                ))}
              </div>
            )}
            <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text-2">
              {skill.content}
            </pre>
            <p className="mt-3 text-[12px] text-text-3">
              Review before adding — skills are instructions the model follows on your behalf.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              {added ? (
                <>
                  <span className="flex items-center text-[13.5px] font-medium text-success">Added ✓</span>
                  <Button className="!px-4 !py-2 text-[13px]" onClick={() => router.push("/settings/skills")}>
                    View skills
                  </Button>
                </>
              ) : (
                <Button className="!px-4 !py-2 text-[13px]" onClick={add}>
                  Add to my Xome
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

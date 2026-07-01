"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">{title}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onClick,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const Cmp = onClick ? "button" : "div";
  return (
    <Cmp
      onClick={onClick}
      className={cn(
        "w-full rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5 text-left",
        onClick && "xo-press hover:border-border-strong",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {title && <div className="text-[14.5px] font-medium text-text">{title}</div>}
          {subtitle && <div className="mt-0.5 text-[13px] text-text-2">{subtitle}</div>}
          {children}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </Cmp>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 rounded-full border transition-colors",
        on ? "border-accent bg-accent" : "border-border-strong bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform",
          on ? "left-[22px]" : "left-0.5",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

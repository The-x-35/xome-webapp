"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ── Card (XomeCard), hairline border, 20px radius, accent ring when selected ── */
export function Card({
  children,
  className,
  selected = false,
  elevated = false,
  onClick,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  elevated?: boolean;
  onClick?: () => void;
  as?: "div" | "button";
}) {
  return (
    <As
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-card)] bg-surface text-left transition-all duration-200",
        selected
          ? "border-[1.4px] border-accent shadow-[0_0_0_3px_var(--accent-ring)]"
          : "border border-border",
        elevated && "shadow-[var(--shadow-card)]",
        onClick && "xo-press cursor-pointer hover:border-border-strong",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ── Tag (XomeTag), pill status chip ── */
type TagKind = "primary" | "success" | "warning" | "neutral";
export function Tag({
  children,
  kind = "neutral",
  dot = false,
  className,
}: {
  children: ReactNode;
  kind?: TagKind;
  dot?: boolean;
  className?: string;
}) {
  const styles: Record<TagKind, string> = {
    primary: "bg-accent text-on-ink",
    success: "bg-success-soft text-success",
    warning: "bg-danger-soft text-danger",
    neutral: "bg-surface-2 text-text-2",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold tracking-[0.02em]",
        styles[kind],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            kind === "success" ? "bg-success" : "bg-current",
          )}
        />
      )}
      {children}
    </span>
  );
}

/* ── StatusPill (XomeStatusPill), accent-tinted running indicator ── */
export function StatusPill({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12.5px] font-semibold",
        "border border-[color-mix(in_srgb,var(--accent)_25%,transparent)]",
        "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent-text",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ── Buttons, stadium (pill) shape, three variants ── */
type BtnVariant = "filled" | "outlined" | "text" | "danger";
export function Button({
  children,
  variant = "filled",
  className,
  ...rest
}: { children: ReactNode; variant?: BtnVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<BtnVariant, string> = {
    filled: "bg-ink text-on-ink px-5 py-3 hover:opacity-90",
    outlined: "border-[1.4px] border-border-strong text-text px-[18px] py-3 hover:border-text-3",
    text: "text-accent-text px-3 py-2 hover:bg-surface-2",
    danger: "bg-danger text-white px-5 py-3 hover:opacity-90",
  };
  return (
    <button
      {...rest}
      className={cn(
        "xo-press inline-flex items-center justify-center gap-2 rounded-full text-[14px] font-semibold tracking-[-0.01em] transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── Chip, selectable filter chip ── */
export function Chip({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "xo-press inline-flex items-center gap-1.5 rounded-full border px-[10px] py-1.5 text-[12.5px] font-medium transition",
        selected
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-border bg-surface-2 text-text-2 hover:text-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── MetaChip, small monospace meta (size / accel / context) ── */
export function MetaChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-2">
      {icon}
      {children}
    </span>
  );
}

/* ── Spinner ── */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("xo-spin inline-block rounded-full border-2 border-current border-t-transparent align-middle", className)}
      style={{ width: size, height: size, opacity: 0.6 }}
      aria-label="loading"
    />
  );
}

/* ── EmptyState (XomeEmptyState) ── */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-8 py-16 text-center">
      {icon && <div className="mb-1 text-text-3">{icon}</div>}
      <h2 className="font-display text-2xl font-semibold tracking-[-0.01em]">{title}</h2>
      {body && <p className="text-[14px] leading-relaxed text-text-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Shimmer skeleton ── */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("xo-shimmer rounded-xl", className)} />;
}

import { cn } from "@/lib/utils";

/**
 * Xome brand mark, the locked hexagon with side pins and an X knockout.
 * Port of XomeAvatar (CustomPaint) + the marketing site's Mark.
 *
 * The hexagon fills with `currentColor` (set it via a text-* class, `text-ink`
 * for the logo, `text-text` inside chat). The X punches through in `--on-ink`,
 * which is the correct contrast against an ink-colored hexagon in both themes.
 */
export function Mark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-2 8 124 116"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 text-ink", className)}
    >
      <polygon points="60,12 108,40 108,92 60,120 12,92 12,40" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="12" y1="56" x2="2" y2="56" />
        <line x1="12" y1="76" x2="2" y2="76" />
        <line x1="12" y1="56" x2="12" y2="76" />
        <line x1="108" y1="56" x2="118" y2="56" />
        <line x1="108" y1="76" x2="118" y2="76" />
        <line x1="108" y1="56" x2="108" y2="76" />
      </g>
      <g stroke="var(--on-ink)" strokeWidth="6" strokeLinecap="round">
        <line x1="38" y1="50" x2="82" y2="82" />
        <line x1="82" y1="50" x2="38" y2="82" />
      </g>
    </svg>
  );
}

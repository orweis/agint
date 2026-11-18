import { cx } from "@/lib/cx";

/** The mark: one source at the centre, its picture widening in rings, a lead on the edge. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cx("size-7", className)}>
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--source)" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--source)" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" fill="var(--source)" />
      <circle cx="26" cy="9" r="2.6" fill="none" stroke="var(--lead)" strokeWidth="1.6" strokeDasharray="2 1.6" />
      <circle cx="8" cy="24.5" r="2.2" fill="var(--lead)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-bold tracking-tight text-ink", className)}>
      <LogoMark />
      <span>
        AGINT<span className="sr-only"> — agent intelligence</span>
      </span>
    </span>
  );
}

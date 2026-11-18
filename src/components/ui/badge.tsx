import type { ReactNode } from "react";

import type { Tone } from "@/lib/domain";
import { cx } from "@/lib/cx";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill text-ink-2 border-rule",
  accent: "bg-source-tint text-source-ink border-source/30",
  good: "bg-good-tint text-good-ink border-good/30",
  warn: "bg-lead-tint text-lead-ink border-lead/40",
  danger: "bg-danger-tint text-danger-ink border-danger/30",
  info: "bg-info-tint text-info-ink border-info/30",
};

export function Badge({ tone = "neutral", children, dashed = false, title }: { tone?: Tone; children: ReactNode; dashed?: boolean; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone], dashed && "border-dashed")}>
      {children}
    </span>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A command or snippet with a copy button. `label` names it for screen readers. */
export function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-md border border-rule bg-fill">
      <pre className="p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink wrap-anywhere">
        <code>{value}</code>
      </pre>
      <button
        type="button"
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full border border-rule bg-panel text-ink-2 hover:bg-fill"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

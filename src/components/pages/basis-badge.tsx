import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/domain";

const BASES: Record<string, { label: string; tone: Tone; dashed: boolean; description: string }> = {
  running: { label: "Running", tone: "warn", dashed: false, description: "The reporter saw it running." },
  configured: { label: "Configured", tone: "neutral", dashed: true, description: "Seen in a configuration. Configured is not the same as used." },
  accessed: { label: "Accessed", tone: "info", dashed: false, description: "The reporter used or touched it." },
  mentioned: { label: "Mentioned", tone: "neutral", dashed: true, description: "Only mentioned: heard of, not seen. Not counted." },
};

/** How the reporter knows. A null basis is the agent's own report of what it did. */
export function BasisBadge({ basis }: { basis: string | null }) {
  if (!basis) return <span className="text-xs text-muted">Own report</span>;
  const meta = BASES[basis];
  if (!meta) return <Badge>{basis}</Badge>;
  return (
    <Badge tone={meta.tone} dashed={meta.dashed} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

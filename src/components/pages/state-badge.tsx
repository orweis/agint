import { Badge } from "@/components/ui/badge";
import { ENTITY_STATE_META, SIGNAL_META, type EntityState, type Signal } from "@/lib/domain";

/** A node's state. A lead's badge is dashed: the dash is the claim, never a fact. */
export function StateBadge({ state }: { state: EntityState }) {
  const meta = ENTITY_STATE_META[state];
  return (
    <Badge tone={meta.tone} dashed={state === "lead" || state === "reference"} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function SignalBadges({ signals }: { signals: readonly Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <ul aria-label="Signals" className="flex flex-wrap gap-1.5">
      {signals.map((signal) => (
        <li key={signal}>
          <Badge tone={SIGNAL_META[signal].tone} title={SIGNAL_META[signal].description}>
            {SIGNAL_META[signal].label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

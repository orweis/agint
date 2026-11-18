import { ENTITY_STATE_META } from "@/lib/domain";

import { GlyphIcon, type GlyphSpec } from "./glyph";

const spec = (over: Partial<GlyphSpec>): GlyphSpec => ({ kind: "agent", state: "lead", role: "sighting", flag: null, quiet: false, aggregate: false, ...over });

const NODES: { label: string; note: string; spec: GlyphSpec }[] = [
  { label: ENTITY_STATE_META.source.label, note: "Connected and reports its own view", spec: spec({ state: "source", role: "source" }) },
  { label: "Principal", note: "Who an agent works for", spec: spec({ kind: "person", state: "corroborated", role: "principal" }) },
  { label: "Reach", note: "What a source uses", spec: spec({ kind: "service", state: "corroborated", role: "reach" }) },
  { label: `${ENTITY_STATE_META.lead.label} (dashed)`, note: ENTITY_STATE_META.lead.description, spec: spec({}) },
  { label: `${ENTITY_STATE_META.corroborated.label} (solid)`, note: ENTITY_STATE_META.corroborated.description, spec: spec({ kind: "mcp_server", state: "corroborated" }) },
  { label: ENTITY_STATE_META.traced.label, note: ENTITY_STATE_META.traced.description, spec: spec({ kind: "mcp_server", state: "traced", role: "reach" }) },
  { label: `${ENTITY_STATE_META.reference.label} (dotted)`, note: ENTITY_STATE_META.reference.description, spec: spec({ state: "reference" }) },
  { label: "Signal", note: "Red when a key is visible that was not issued to the reporter", spec: spec({ kind: "credential", flag: "danger" }) },
];

const LINES: { label: string; stroke: string; dash?: string; width: number }[] = [
  { label: "Uses", stroke: "var(--edge)", width: 1.5 },
  { label: "Sees", stroke: "var(--lead)", dash: "6 4", width: 2 },
  { label: "Mentions", stroke: "var(--muted)", dash: "1.5 4", width: 1.5 },
];

/** The grammar in one line under the canvas. It scrolls sideways on a narrow screen. */
export function Legend() {
  return (
    <ul aria-label="Legend" className="flex items-center gap-x-4 gap-y-1 overflow-x-auto border-t lg:flex-wrap lg:gap-x-3.5 border-rule px-3 py-2 text-xs whitespace-nowrap text-ink-2">
      {NODES.map((item) => (
        <li key={item.label} title={item.note} className="flex items-center gap-1.5">
          <GlyphIcon spec={item.spec} size={20} />
          {item.label}
        </li>
      ))}
      {LINES.map((line) => (
        <li key={line.label} className="flex items-center gap-1.5">
          <svg width={24} height={8} aria-hidden className="shrink-0">
            <line x1={1} y1={4} x2={23} y2={4} stroke={line.stroke} strokeWidth={line.width} strokeDasharray={line.dash} strokeLinecap="round" />
          </svg>
          {line.label}
        </li>
      ))}
    </ul>
  );
}

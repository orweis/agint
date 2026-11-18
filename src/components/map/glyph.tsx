import { Bot, Check, Cloud, Database, FileText, GitBranch, KeyRound, Laptop, Plug, User, Workflow, Wrench, type LucideIcon } from "lucide-react";

import type { EntityKind, EntityState, Tone } from "@/lib/domain";
import { glyphRadius } from "@/lib/map-layout";
import { isAggregate, isSource, signalTone, type NodeRole } from "@/lib/map-model";
import type { MapNode } from "@/lib/network-map";

/** The map's visual grammar in one place: shape and icon per kind, outline per state, hue per role. */

export const KIND_ICON: Record<EntityKind, LucideIcon> = {
  agent: Bot,
  person: User,
  host: Laptop,
  mcp_server: Plug,
  tool: Wrench,
  credential: KeyRound,
  repository: GitBranch,
  service: Cloud,
  data_store: Database,
  resource: FileText,
  job: Workflow,
};

export const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-fill text-ink-2",
  accent: "bg-source-tint text-source-ink",
  good: "bg-good-tint text-good-ink",
  warn: "bg-lead-tint text-lead-ink",
  danger: "bg-danger-tint text-danger-ink",
  info: "bg-info-tint text-info-ink",
};

/** Dash patterns carry the state, so it never rests on colour. */
export const STATE_DASH: Record<EntityState, string | undefined> = {
  source: undefined,
  lead: "5 3.5",
  corroborated: undefined,
  traced: undefined,
  reference: "1.5 3.5",
  dismissed: undefined,
};

export interface GlyphPaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: string | undefined;
  icon: string;
}

export interface GlyphSpec {
  kind: EntityKind;
  state: EntityState;
  role: NodeRole;
  /** The most serious signal tone, for the badge. */
  flag: "danger" | "warn" | null;
  quiet: boolean;
  aggregate: boolean;
}

export function specOf(node: MapNode, role: NodeRole): GlyphSpec {
  return {
    kind: node.kind,
    state: node.state,
    role,
    flag: signalTone(node.signals),
    quiet: isSource(node) && node.signals.includes("stale_source"),
    aggregate: isAggregate(node),
  };
}

export function paintOf(spec: GlyphSpec): GlyphPaint {
  const dash = STATE_DASH[spec.state];
  const strokeWidth = spec.state === "corroborated" ? 2.75 : 1.75;
  if (spec.state === "dismissed") return { fill: "var(--canvas)", stroke: "var(--faint)", strokeWidth: 1.25, dash, icon: "var(--faint)" };
  if (spec.state === "reference") return { fill: "var(--canvas)", stroke: "var(--muted)", strokeWidth: 1.75, dash, icon: "var(--muted)" };
  if (spec.state === "traced") return { fill: "var(--good-tint)", stroke: "var(--good)", strokeWidth: 2, dash, icon: "var(--good-ink)" };
  if (spec.role === "source") {
    return spec.quiet
      ? { fill: "var(--source-tint)", stroke: "var(--source)", strokeWidth: 2, dash, icon: "var(--source-ink)" }
      : { fill: "var(--source)", stroke: "var(--source)", strokeWidth: 2, dash, icon: "var(--on-source)" };
  }
  if (spec.role === "principal") return { fill: "var(--person-tint)", stroke: "var(--person)", strokeWidth, dash, icon: "var(--person-ink)" };
  if (spec.role === "sighting" || spec.flag !== null) return { fill: "var(--lead-tint)", stroke: "var(--lead)", strokeWidth: strokeWidth + 0.25, dash, icon: "var(--lead-ink)" };
  return { fill: "var(--thing-tint)", stroke: "var(--thing)", strokeWidth, dash, icon: "var(--thing-ink)" };
}

/** A node's mark, centred on the origin. Used on the canvas, in the legend and in lists. */
export function Glyph({ spec }: { spec: GlyphSpec }) {
  const paint = paintOf(spec);
  const r = glyphRadius(spec.kind, spec.role === "source");
  const Icon = KIND_ICON[spec.kind];
  const shape = { fill: paint.fill, stroke: paint.stroke, strokeWidth: paint.strokeWidth, strokeDasharray: paint.dash, strokeLinecap: "round" as const };
  const iconSize = spec.kind === "agent" ? (spec.role === "source" ? 19 : 17) : spec.kind === "person" ? 14 : 15;
  return (
    <>
      {spec.kind === "agent" || spec.kind === "person" ? (
        <circle r={r} {...shape} />
      ) : spec.kind === "credential" ? (
        <rect x={-11.5} y={-11.5} width={23} height={23} rx={4} transform="rotate(45)" {...shape} />
      ) : (
        <>
          {spec.aggregate ? (
            <>
              <rect x={-r + 7} y={-r - 7} width={r * 2} height={r * 2} rx={6} fill="var(--canvas)" stroke={paint.stroke} strokeWidth={1.25} />
              <rect x={-r + 3.5} y={-r - 3.5} width={r * 2} height={r * 2} rx={6} fill="var(--canvas)" stroke={paint.stroke} strokeWidth={1.25} />
            </>
          ) : null}
          <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={6} {...shape} />
        </>
      )}
      <Icon x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} color={paint.icon} strokeWidth={2} aria-hidden />
      {spec.state === "traced" ? (
        <g transform={`translate(${r - 2},${r - 2})`}>
          <circle r={6.5} fill="var(--good)" stroke="var(--canvas)" strokeWidth={1.5} />
          <Check x={-4.5} y={-4.5} width={9} height={9} color="var(--canvas)" strokeWidth={3.5} aria-hidden />
        </g>
      ) : null}
      {spec.flag !== null && spec.state !== "dismissed" ? (
        <g transform={`translate(${r - 2},${-r + 2})`}>
          <circle r={6.5} fill={spec.flag === "danger" ? "var(--danger)" : "var(--lead)"} stroke="var(--canvas)" strokeWidth={1.5} />
          <path d="M0,-3.2 V0.6 M0,3 V3.1" stroke="var(--canvas)" strokeWidth={1.9} strokeLinecap="round" fill="none" />
        </g>
      ) : null}
    </>
  );
}

/** The glyph as a small inline picture, for lists and the legend. Decorative: the text beside it says the same. */
export function GlyphIcon({ spec, size = 28 }: { spec: GlyphSpec; size?: number }) {
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden className="shrink-0">
      <Glyph spec={spec} />
    </svg>
  );
}

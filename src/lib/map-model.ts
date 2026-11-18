/**
 * How the map reads a `NetworkMap`: each node's role in the picture, each edge's class, the counters,
 * a node's neighbourhood and reporters, and the text equivalent of the whole thing.
 * Pure and client-safe. See docs/MAP.md.
 */
import {
  AGENT_RELATIONS,
  ENTITY_KIND_META,
  ENTITY_STATE_META,
  REACH_RELATIONS,
  RELATION_META,
  SIGNAL_META,
  SIGHTING_BASES,
  isOneOf,
  type EntityKind,
  type SightingBasis,
  type Signal,
  type Tone,
} from "./domain";
import type { MapEdge, MapNode, NetworkMap } from "./network-map";

const BASIS_STRENGTH: readonly SightingBasis[] = ["accessed", "running", "configured", "mentioned"];

export const BASIS_LABEL: Record<SightingBasis, string> = { accessed: "Accessed", running: "Seen running", configured: "Configured", mentioned: "Mentioned" };

export type MapGraph = Pick<NetworkMap, "nodes" | "edges">;

/** Where a node sits in the picture. Hue and column follow from it. */
export type NodeRole = "principal" | "source" | "reach" | "sighting";

/** How an edge is drawn. */
export type EdgeClass = "context" | "reach" | "sighting" | "agent" | "mention";

export interface MapIndex {
  byId: Map<string, MapNode>;
  /** Every edge touching a node, in the map's order. */
  edgesOf: Map<string, MapEdge[]>;
  /** A source's node, by the agent id that appears in `reporterIds`. */
  byAgentId: Map<string, MapNode>;
  roles: Map<string, NodeRole>;
}

export function isSource(node: MapNode): boolean {
  return node.kind === "agent" && node.state === "source";
}

/** A node made by `collapseLeaves` to stand for several. */
export function isAggregate(node: MapNode): boolean {
  return node.attributes.aggregate !== undefined;
}

export function indexMap(graph: MapGraph): MapIndex {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesOf = new Map<string, MapEdge[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    edgesOf.get(edge.source)?.push(edge);
    if (edge.target !== edge.source) edgesOf.get(edge.target)?.push(edge);
  }
  const byAgentId = new Map<string, MapNode>();
  for (const node of graph.nodes) {
    if (node.source) byAgentId.set(node.source.agentId, node);
  }

  const inReach = new Set<string>();
  for (const edge of graph.edges) {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to) continue;
    const reaches = isOneOf(REACH_RELATIONS, edge.relation) || edge.relation === "runs_on" || edge.relation === "shares_job";
    if (!reaches) continue;
    if (isSource(from)) inReach.add(to.id);
    if (isSource(to)) inReach.add(from.id);
  }
  const roles = new Map<string, NodeRole>();
  for (const node of graph.nodes) {
    if (node.kind === "person") roles.set(node.id, "principal");
    else if (isSource(node)) roles.set(node.id, "source");
    else if (node.kind === "agent" || node.state === "reference" || !inReach.has(node.id)) roles.set(node.id, "sighting");
    else roles.set(node.id, "reach");
  }
  return { byId, edgesOf, byAgentId, roles };
}

export function roleOf(index: MapIndex, id: string): NodeRole {
  return index.roles.get(id) ?? "sighting";
}

/** An edge nobody saw: every reporter only heard of it. Mentions never corroborate. */
export function isMention(edge: MapEdge): boolean {
  return edge.bases.length > 0 && edge.bases[0] === "mentioned";
}

export function edgeClass(edge: MapEdge, index: MapIndex): EdgeClass {
  const from = index.byId.get(edge.source);
  const to = index.byId.get(edge.target);
  if (isMention(edge) || from?.state === "reference" || to?.state === "reference") return "mention";
  if (edge.relation === "works_for" || edge.relation === "runs_on") return "context";
  if (edge.relation === "sees") return "sighting";
  // A claim about an agent that does not report for itself is something a source saw.
  if (from && from.kind === "agent" && !isSource(from)) return "sighting";
  if (isOneOf(AGENT_RELATIONS, edge.relation) && from?.kind === "agent" && to?.kind === "agent") return "agent";
  return "reach";
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warn: 1, info: 2, accent: 3, good: 4, neutral: 5 };

/** The most serious tone among a node's signals, or null when it has none worth a badge. */
export function signalTone(signals: readonly Signal[]): "danger" | "warn" | null {
  let best: Tone | null = null;
  for (const signal of signals) {
    const tone = SIGNAL_META[signal].tone;
    if (best === null || TONE_RANK[tone] < TONE_RANK[best]) best = tone;
  }
  return best === "danger" ? "danger" : best === "warn" ? "warn" : null;
}

/** Open findings: seen or flagged, and no person has traced or dismissed them yet. */
export function needsPerson(node: MapNode, index: MapIndex): boolean {
  if (node.state !== "lead" && node.state !== "corroborated") return false;
  if (isAggregate(node)) return false;
  return roleOf(index, node.id) === "sighting" || signalTone(node.signals) !== null;
}

/** Open findings, most serious first, then most recently seen. */
export function attentionList(graph: MapGraph, index: MapIndex = indexMap(graph)): MapNode[] {
  const rank = (node: MapNode) => {
    const tone = signalTone(node.signals);
    return tone === "danger" ? 0 : tone === "warn" ? 1 : 2;
  };
  return graph.nodes
    .filter((node) => needsPerson(node, index))
    .sort((a, b) => rank(a) - rank(b) || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id));
}

export interface MapCounters {
  sources: number;
  leads: number;
  corroborated: number;
  traced: number;
  /** Everything somebody saw: sources, leads, corroborated and traced. */
  mapped: number;
  /** Mentioned only. Never part of `mapped`. */
  references: number;
  dismissed: number;
  /** Agents somebody saw, sources included: the denominator for `sources`. */
  agentsSeen: number;
  quietSources: number;
  /** Reports the picture was built from. */
  reports: number;
  /** Open findings that need a person. */
  attention: number;
}

export function countMap(graph: MapGraph, index: MapIndex = indexMap(graph)): MapCounters {
  const counters: MapCounters = { sources: 0, leads: 0, corroborated: 0, traced: 0, mapped: 0, references: 0, dismissed: 0, agentsSeen: 0, quietSources: 0, reports: 0, attention: 0 };
  for (const node of graph.nodes) {
    switch (node.state) {
      case "source":
        counters.sources += 1;
        break;
      case "lead":
        counters.leads += 1;
        break;
      case "corroborated":
        counters.corroborated += 1;
        break;
      case "traced":
        counters.traced += 1;
        break;
      case "reference":
        counters.references += 1;
        break;
      case "dismissed":
        counters.dismissed += 1;
        break;
    }
    const counted = node.state !== "reference" && node.state !== "dismissed";
    if (counted) counters.mapped += 1;
    if (counted && node.kind === "agent") counters.agentsSeen += 1;
    if (node.state === "source" && node.signals.includes("stale_source")) counters.quietSources += 1;
    if (node.source) counters.reports += node.source.reportCount;
    if (needsPerson(node, index)) counters.attention += 1;
  }
  return counters;
}

export interface Neighborhood {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/** A node, the nodes one edge away, and the edges between it and them. */
export function neighborhood(index: MapIndex, id: string): Neighborhood {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!index.byId.has(id)) return { nodeIds, edgeIds };
  nodeIds.add(id);
  for (const edge of index.edgesOf.get(id) ?? []) {
    edgeIds.add(edge.id);
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }
  return { nodeIds, edgeIds };
}

export interface Reporter {
  /** The agent id from `reporterIds`. */
  agentId: string;
  /** Its node, when the reporter is on this map. */
  node: MapNode | null;
  label: string;
  firstAt: string;
  lastAt: string;
  /** Reports behind the edges it reported. */
  count: number;
}

/** Who saw a node, other than the node itself, earliest first. Mentions are not sightings. */
export function reportersOf(index: MapIndex, id: string): Reporter[] {
  const self = index.byId.get(id);
  const found = new Map<string, Reporter>();
  for (const edge of index.edgesOf.get(id) ?? []) {
    if (isMention(edge)) continue;
    for (const agentId of edge.reporterIds) {
      const node = index.byAgentId.get(agentId) ?? index.byId.get(agentId) ?? null;
      if (node && self && node.id === self.id) continue;
      const seen = found.get(agentId);
      if (seen) {
        if (edge.firstAt < seen.firstAt) seen.firstAt = edge.firstAt;
        if (edge.lastAt > seen.lastAt) seen.lastAt = edge.lastAt;
        seen.count += edge.count;
      } else {
        found.set(agentId, { agentId, node, label: node?.label ?? agentId, firstAt: edge.firstAt, lastAt: edge.lastAt, count: edge.count });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.agentId.localeCompare(b.agentId));
}

export interface Access {
  /** Agents that used it: a reach relation of their own, or a sighting on the basis `accessed`. */
  usedBy: MapNode[];
  /** Agents that saw it running or configured without using it. Configured is not accessed. */
  seenBy: MapNode[];
  /** Agents that only mentioned it. */
  mentionedBy: MapNode[];
  /** Every basis reporters gave, strongest first. */
  bases: SightingBasis[];
}

export function accessOf(index: MapIndex, id: string): Access {
  const used = new Map<string, MapNode>();
  const seen = new Map<string, MapNode>();
  const mentioned = new Map<string, MapNode>();
  const bases = new Set<SightingBasis>();
  for (const edge of index.edgesOf.get(id) ?? []) {
    if (edge.target !== id) continue;
    for (const basis of edge.bases) bases.add(basis);
    const other = index.byId.get(edge.source);
    if (!other || other.kind !== "agent") continue;
    if (isMention(edge)) mentioned.set(other.id, other);
    else if (edge.bases.includes("accessed") || (edge.bases.length === 0 && isOneOf(REACH_RELATIONS, edge.relation))) used.set(other.id, other);
    else if (edge.relation === "sees" || edge.bases.length > 0) seen.set(other.id, other);
  }
  for (const key of used.keys()) seen.delete(key);
  for (const key of [...used.keys(), ...seen.keys()]) mentioned.delete(key);
  return { usedBy: [...used.values()], seenBy: [...seen.values()], mentionedBy: [...mentioned.values()], bases: SIGHTING_BASES.filter((basis) => bases.has(basis)).sort((a, b) => BASIS_STRENGTH.indexOf(a) - BASIS_STRENGTH.indexOf(b)) };
}

export interface Connection {
  edge: MapEdge;
  other: MapNode;
  /** True when the focused node is the edge's subject. */
  outgoing: boolean;
  /** "release-assistant sees notes-sync" */
  sentence: string;
  reporters: string[];
  cls: EdgeClass;
}

export function edgeSentence(edge: MapEdge, index: MapIndex): string {
  const from = index.byId.get(edge.source)?.label ?? edge.source;
  const to = index.byId.get(edge.target)?.label ?? edge.target;
  return `${from} ${RELATION_META[edge.relation].phrase} ${to}`;
}

function reporterLabels(edge: MapEdge, index: MapIndex): string[] {
  return edge.reporterIds.map((agentId) => (index.byAgentId.get(agentId) ?? index.byId.get(agentId))?.label ?? agentId);
}

/** A node's edges for the dossier, most recent first. */
export function connectionsOf(index: MapIndex, id: string): Connection[] {
  const out: Connection[] = [];
  for (const edge of index.edgesOf.get(id) ?? []) {
    const outgoing = edge.source === id;
    const other = index.byId.get(outgoing ? edge.target : edge.source);
    if (!other) continue;
    out.push({ edge, other, outgoing, sentence: edgeSentence(edge, index), reporters: reporterLabels(edge, index), cls: edgeClass(edge, index) });
  }
  return out.sort((a, b) => b.edge.lastAt.localeCompare(a.edge.lastAt) || a.edge.id.localeCompare(b.edge.id));
}

export interface NextStep {
  id: "connect" | "second_source" | "trace" | "dismiss" | "sighting" | "reopen" | "check_in";
  title: string;
  detail: string;
}

/** The ways a node can move on from its state. A lead has three ways out. */
export function nextSteps(node: MapNode): NextStep[] {
  const steps: NextStep[] = [];
  const connect: NextStep = {
    id: "connect",
    title: "Connect it",
    detail: "Have it connect to the AGINT MCP. It becomes a source with its own view, and every source widens the picture.",
  };
  const trace: NextStep = {
    id: "trace",
    title: "Trace it",
    detail: "A person confirms it through identity, runtime or CI evidence.",
  };
  switch (node.state) {
    case "source":
      if (node.signals.includes("stale_source")) {
        steps.push({ id: "check_in", title: "Ask it to report", detail: "It has gone quiet. Its picture is as of its last report, not now." });
      }
      break;
    case "reference":
      steps.push({ id: "sighting", title: "Wait for a sighting", detail: "It was mentioned, not seen. It is not counted until a source sees it running, configured or accessed." });
      if (node.kind === "agent") steps.push(connect);
      break;
    case "lead":
      if (node.kind === "agent") steps.push(connect);
      steps.push({ id: "second_source", title: "A second source reports it", detail: "When another independent source sees it, it is corroborated. Overlap triangulates." });
      steps.push(trace);
      steps.push({ id: "dismiss", title: "Or dismiss it", detail: "A person rules it out. It leaves the counts and stays in the record." });
      break;
    case "corroborated":
      if (node.kind === "agent") steps.push(connect);
      steps.push(trace);
      steps.push({ id: "dismiss", title: "Or dismiss it", detail: "A person rules it out. It leaves the counts and stays in the record." });
      break;
    case "dismissed":
      steps.push({ id: "reopen", title: "Reopen it", detail: "If it is seen again, a person can reopen it as a lead." });
      break;
    case "traced":
      break;
  }
  return steps;
}

/** The second line under a node's name on the map. */
export function nodeSubtitle(node: MapNode, now: string): string {
  if (isAggregate(node)) return "Grouped";
  if (node.source && node.state === "source") {
    const harness = harnessLabel(node.source.harness);
    return node.signals.includes("stale_source") ? `${harness} · Quiet ${formatAgo(node.source.lastSeenAt, now).replace(" ago", "")}` : harness;
  }
  if (node.kind === "agent") return node.state === "reference" ? "Mentioned agent" : SIGNAL_META.unknown_agent.label;
  if (node.state === "reference") return `${ENTITY_KIND_META[node.kind].label} · mentioned`;
  return ENTITY_KIND_META[node.kind].label;
}

const HARNESS_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  copilot: "Copilot",
  windsurf: "Windsurf",
  devin: "Devin",
  langgraph: "LangGraph",
  crewai: "CrewAI",
  custom: "Custom harness",
};

/** A known harness by its name; anything else as reported. */
export function harnessLabel(harness: string): string {
  return HARNESS_LABELS[harness] ?? harness;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Nov 15, 09:31" in UTC. The same words on the server and in the browser. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** "26h ago", measured from `now` (the map's `generatedAt`), never from the clock. */
export function formatAgo(iso: string, now: string): string {
  const minutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface NodeRow {
  id: string;
  label: string;
  kind: string;
  state: string;
  signals: string;
  reporters: number;
  firstSeen: string;
  lastSeen: string;
}

export interface EdgeRow {
  id: string;
  sentence: string;
  relation: string;
  reporters: string;
  count: number;
  first: string;
  last: string;
}

const KIND_ORDER: Record<EntityKind, number> = { agent: 0, person: 1, host: 2, mcp_server: 3, tool: 4, credential: 5, repository: 6, service: 7, data_store: 8, resource: 9, job: 10 };

export function kindOrder(kind: EntityKind): number {
  return KIND_ORDER[kind];
}

/** Every node as a table row: the map's text equivalent. Agents first, then by kind and name. */
export function nodeRows(graph: MapGraph): NodeRow[] {
  return [...graph.nodes]
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
    .map((node) => ({
      id: node.id,
      label: node.label,
      kind: ENTITY_KIND_META[node.kind].label,
      state: ENTITY_STATE_META[node.state].label,
      signals: node.signals.map((signal) => SIGNAL_META[signal].label).join(", "),
      reporters: node.reporterCount,
      firstSeen: formatWhen(node.firstSeenAt),
      lastSeen: formatWhen(node.lastSeenAt),
    }));
}

/** Every edge as a sentence with its provenance. */
export function edgeRows(graph: MapGraph, index: MapIndex = indexMap(graph)): EdgeRow[] {
  return [...graph.edges]
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.id.localeCompare(b.id))
    .map((edge) => ({
      id: edge.id,
      sentence: edgeSentence(edge, index),
      relation: RELATION_META[edge.relation].label,
      reporters: reporterLabels(edge, index).join(", "),
      count: edge.count,
      first: formatWhen(edge.firstAt),
      last: formatWhen(edge.lastAt),
    }));
}

/** What a screen reader hears for a node: name, kind, state, signals, reporters. */
export function nodeAriaLabel(node: MapNode): string {
  const parts = [node.label, ENTITY_KIND_META[node.kind].label, ENTITY_STATE_META[node.state].label];
  for (const signal of node.signals) parts.push(SIGNAL_META[signal].label);
  if (node.reporterCount > 0) parts.push(`seen by ${node.reporterCount} ${node.reporterCount === 1 ? "source" : "sources"}`);
  return parts.join(", ");
}

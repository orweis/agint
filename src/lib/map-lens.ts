/**
 * Lenses choose the question the map answers; filters narrow within one; `collapseLeaves` keeps a large
 * map legible. Pure and client-safe. See docs/MAP.md, sections 4 and 9.
 */
import { ENTITY_KIND_META, ENTITY_STATE_META, SIGNAL_META, type EntityKind, type EntityState, type Relation, type Signal } from "./domain";
import { harnessLabel, indexMap, isAggregate, isSource, roleOf, signalTone, type MapGraph, type MapIndex } from "./map-model";
import type { MapEdge, MapNode } from "./network-map";

export const LENSES = ["picture", "agents", "reach", "exposure", "principal"] as const;
export type Lens = (typeof LENSES)[number];

export const LENS_META: Record<Lens, { label: string; description: string }> = {
  picture: { label: "Picture", description: "Everything the sources reported: who works for whom, what they reach, what they saw." },
  agents: { label: "Agents", description: "Agents only, and how they touch: direct links and what they share." },
  reach: { label: "Reach", description: "What each source uses, by its own report. No sightings." },
  exposure: { label: "Exposure", description: "What sources saw that nobody has connected, with who reported it." },
  principal: { label: "By principal", description: "One person's sources, their reach and what they saw." },
};

/** Two agents that touch the same thing. Derived, never reported: drawn only in the Agents lens. */
export interface Overlap {
  id: string;
  a: string;
  b: string;
  /** Ids of the nodes both agents touch. */
  via: string[];
}

export interface LensView {
  nodes: MapNode[];
  edges: MapEdge[];
  overlaps: Overlap[];
}

/** The group key for agents that could not say who they work for. */
export const NO_PRINCIPAL = "none";

export interface Principal {
  id: string;
  label: string;
  /** Sources working for this person. */
  sources: number;
}

/** Which principals each node belongs to. A node two principals' agents touch belongs to both. */
export function principalGroups(graph: MapGraph, index: MapIndex = indexMap(graph)): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  const add = (id: string, group: string) => {
    const set = groups.get(id) ?? new Set<string>();
    set.add(group);
    groups.set(id, set);
  };
  for (const node of graph.nodes) {
    if (node.kind === "person") add(node.id, node.id);
  }
  const employed = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.relation !== "works_for") continue;
    const person = index.byId.get(edge.target);
    if (person?.kind !== "person" || !index.byId.has(edge.source)) continue;
    add(edge.source, person.id);
    employed.add(edge.source);
  }
  for (const node of graph.nodes) {
    if (isSource(node) && !employed.has(node.id)) add(node.id, NO_PRINCIPAL);
  }
  // Everything else belongs with the agents that touch it; hearsay one hop out follows its neighbour.
  const anchored = new Set(groups.keys());
  for (let round = 0; round < 3; round += 1) {
    const next = new Map<string, Set<string>>();
    for (const node of graph.nodes) {
      if (anchored.has(node.id)) continue;
      for (const edge of index.edgesOf.get(node.id) ?? []) {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const other = index.byId.get(otherId);
        if (!other || other.kind === "person" || !anchored.has(otherId)) continue;
        if (round === 0 && other.kind !== "agent") continue;
        const set = next.get(node.id) ?? new Set<string>();
        for (const group of groups.get(otherId) ?? []) set.add(group);
        next.set(node.id, set);
      }
    }
    for (const [id, set] of next) {
      if (set.size === 0) continue;
      groups.set(id, set);
      anchored.add(id);
    }
  }
  return groups;
}

/** The people the principal picker offers, by name. "No principal" comes last when it has agents. */
export function principals(graph: MapGraph, index: MapIndex = indexMap(graph)): Principal[] {
  const groups = principalGroups(graph, index);
  const count = new Map<string, number>();
  for (const node of graph.nodes) {
    if (!isSource(node)) continue;
    for (const group of groups.get(node.id) ?? []) count.set(group, (count.get(group) ?? 0) + 1);
  }
  const people = graph.nodes
    .filter((node) => node.kind === "person" && node.state !== "dismissed")
    .map((node) => ({ id: node.id, label: node.label, sources: count.get(node.id) ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const orphans = count.get(NO_PRINCIPAL) ?? 0;
  return orphans > 0 ? [...people, { id: NO_PRINCIPAL, label: "No principal", sources: orphans }] : people;
}

/** Pairs of agents that touch the same node, with what they share. References do not count. */
export function agentOverlaps(graph: MapGraph, index: MapIndex = indexMap(graph)): Overlap[] {
  const found = new Map<string, Overlap>();
  for (const node of graph.nodes) {
    if (node.kind === "agent" || node.state === "reference" || node.state === "dismissed") continue;
    const agents = new Set<string>();
    for (const edge of index.edgesOf.get(node.id) ?? []) {
      const other = index.byId.get(edge.source === node.id ? edge.target : edge.source);
      if (other?.kind === "agent" && other.state !== "dismissed") agents.add(other.id);
    }
    const ids = [...agents].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i]!;
        const b = ids[j]!;
        const id = `ovl:${a}|${b}`;
        const overlap = found.get(id) ?? { id, a, b, via: [] };
        overlap.via.push(node.id);
        found.set(id, overlap);
      }
    }
  }
  return [...found.values()].map((overlap) => ({ ...overlap, via: overlap.via.sort() })).sort((x, y) => x.id.localeCompare(y.id));
}

function keep(graph: MapGraph, ids: Set<string>, edgeTest: (edge: MapEdge) => boolean = () => true): LensView {
  return {
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edgeTest(edge)),
    overlaps: [],
  };
}

export interface LensOptions {
  /** For the principal lens: a person's node id, or `NO_PRINCIPAL`. */
  principalId?: string | null;
}

export function applyLens(graph: MapGraph, lens: Lens, options: LensOptions = {}, index: MapIndex = indexMap(graph)): LensView {
  switch (lens) {
    case "picture":
      return { nodes: graph.nodes, edges: graph.edges, overlaps: [] };
    case "agents": {
      const ids = new Set(graph.nodes.filter((node) => node.kind === "agent").map((node) => node.id));
      const view = keep(graph, ids);
      return { ...view, overlaps: agentOverlaps(graph, index).filter((overlap) => ids.has(overlap.a) && ids.has(overlap.b)) };
    }
    case "reach": {
      const ids = new Set(graph.nodes.filter((node) => roleOf(index, node.id) !== "sighting").map((node) => node.id));
      return keep(graph, ids, (edge) => edge.relation !== "sees");
    }
    case "exposure": {
      const exposed = new Set<string>();
      for (const node of graph.nodes) {
        if (isSource(node) || node.kind === "person") continue;
        if (roleOf(index, node.id) === "sighting" || signalTone(node.signals) !== null) exposed.add(node.id);
      }
      const ids = new Set(exposed);
      for (const edge of graph.edges) {
        const from = index.byId.get(edge.source);
        const to = index.byId.get(edge.target);
        if (from && to && exposed.has(to.id) && isSource(from)) ids.add(from.id);
        if (from && to && exposed.has(from.id) && isSource(to)) ids.add(to.id);
      }
      return keep(graph, ids, (edge) => exposed.has(edge.source) || exposed.has(edge.target));
    }
    case "principal": {
      const groups = principalGroups(graph, index);
      const chosen = options.principalId ?? principals(graph, index)[0]?.id ?? null;
      const ids = new Set<string>();
      if (chosen !== null) {
        for (const node of graph.nodes) {
          if (groups.get(node.id)?.has(chosen)) ids.add(node.id);
        }
      }
      return keep(graph, ids);
    }
  }
}

export interface MapFilters {
  /** Empty means every kind. */
  kinds: EntityKind[];
  /** Empty means every state except dismissed. */
  states: EntityState[];
  /** Empty means any; otherwise a node must carry one of these. */
  signals: Signal[];
}

export const NO_FILTERS: MapFilters = { kinds: [], states: [], signals: [] };

export function activeFilterCount(filters: MapFilters): number {
  return filters.kinds.length + filters.states.length + filters.signals.length;
}

export function passesFilters(node: MapNode, filters: MapFilters): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes(node.kind)) return false;
  if (filters.states.length > 0 ? !filters.states.includes(node.state) : node.state === "dismissed") return false;
  if (filters.signals.length > 0 && !node.signals.some((signal) => filters.signals.includes(signal))) return false;
  return true;
}

/** Hides what the filters exclude, and every edge or overlap that loses an end. */
export function applyFilters(view: LensView, filters: MapFilters): LensView {
  const nodes = view.nodes.filter((node) => passesFilters(node, filters));
  if (nodes.length === view.nodes.length) return view;
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: view.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    overlaps: view.overlaps.filter((overlap) => ids.has(overlap.a) && ids.has(overlap.b)),
  };
}

/** Case-insensitive match on everything a person might type: name, ref, kind, state, signals, harness, principal, attributes. */
export function matchesQuery(node: MapNode, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = [
    node.label,
    node.ref,
    ENTITY_KIND_META[node.kind].label,
    ENTITY_STATE_META[node.state].label,
    ...node.signals.map((signal) => SIGNAL_META[signal].label),
    ...Object.values(node.attributes),
    node.source ? harnessLabel(node.source.harness) : "",
    node.source?.harness ?? "",
    node.source?.principalName ?? "",
    node.source?.host ?? "",
    node.source?.model ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((term) => hay.includes(term));
}

/** Ids matching a search, or null when there is no search (so nothing is dimmed). */
export function searchMatches(nodes: readonly MapNode[], query: string): Set<string> | null {
  if (query.trim() === "") return null;
  return new Set(nodes.filter((node) => matchesQuery(node, query)).map((node) => node.id));
}

export interface CollapseOptions {
  /** Maps at or under this many nodes are left alone. */
  threshold?: number;
  /** The fewest leaves worth grouping. */
  minGroup?: number;
  /** Aggregate ids a person opened. */
  expanded?: ReadonlySet<string>;
}

export interface Collapsed {
  graph: MapGraph;
  /** Members of each aggregate node, by its id. */
  groups: Map<string, MapNode[]>;
}

export const COLLAPSE_THRESHOLD = 120;

const NEVER_COLLAPSED: readonly EntityKind[] = ["agent", "person", "credential"];

export function aggregateId(agentNodeId: string, kind: EntityKind): string {
  return `agg:${agentNodeId}:${kind}`;
}

/**
 * Past the threshold, groups each source's exclusive leaves by kind: "14 resources" instead of 14 nodes.
 * Anything with a signal, anything two nodes touch, and every agent, person and credential stays itself.
 */
export function collapseLeaves(graph: MapGraph, options: CollapseOptions = {}, index: MapIndex = indexMap(graph)): Collapsed {
  const { threshold = COLLAPSE_THRESHOLD, minGroup = 3, expanded = new Set<string>() } = options;
  const groups = new Map<string, MapNode[]>();
  if (graph.nodes.length <= threshold) return { graph, groups };

  const owner = new Map<string, string>();
  const buckets = new Map<string, MapNode[]>();
  for (const node of graph.nodes) {
    if (NEVER_COLLAPSED.includes(node.kind) || node.signals.length > 0 || isAggregate(node)) continue;
    if (node.state !== "lead" || roleOf(index, node.id) !== "reach") continue;
    const edges = index.edgesOf.get(node.id) ?? [];
    const neighbours = new Set(edges.map((edge) => (edge.source === node.id ? edge.target : edge.source)));
    if (neighbours.size !== 1) continue;
    const [agentId] = [...neighbours];
    const agent = agentId === undefined ? undefined : index.byId.get(agentId);
    if (!agent || !isSource(agent)) continue;
    const id = aggregateId(agent.id, node.kind);
    owner.set(node.id, agent.id);
    buckets.set(id, [...(buckets.get(id) ?? []), node]);
  }

  const replaced = new Map<string, string>();
  for (const [id, members] of buckets) {
    if (members.length < minGroup || expanded.has(id)) continue;
    groups.set(id, members);
    for (const member of members) replaced.set(member.id, id);
  }
  if (groups.size === 0) return { graph, groups };

  const nodes: MapNode[] = graph.nodes.filter((node) => !replaced.has(node.id));
  const edges: MapEdge[] = graph.edges.filter((edge) => !replaced.has(edge.source) && !replaced.has(edge.target));
  for (const [id, members] of groups) {
    const first = members[0]!;
    const agentId = owner.get(first.id)!;
    const kind = first.kind;
    const memberIds = new Set(members.map((member) => member.id));
    const memberEdges = graph.edges.filter((edge) => memberIds.has(edge.source) || memberIds.has(edge.target));
    const times = members.map((member) => member.firstSeenAt).sort();
    const lasts = members.map((member) => member.lastSeenAt).sort();
    nodes.push({
      id,
      kind,
      label: `${members.length} ${ENTITY_KIND_META[kind].plural.toLowerCase()}`,
      ref: id,
      state: "lead",
      reporterCount: 1,
      firstSeenAt: times[0]!,
      lastSeenAt: lasts[lasts.length - 1]!,
      signals: [],
      attributes: { aggregate: String(members.length) },
      source: null,
    });
    const relationCount = new Map<Relation, number>();
    for (const edge of memberEdges) relationCount.set(edge.relation, (relationCount.get(edge.relation) ?? 0) + 1);
    const relation = [...relationCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "uses";
    const firsts = memberEdges.map((edge) => edge.firstAt).sort();
    const edgeLasts = memberEdges.map((edge) => edge.lastAt).sort();
    edges.push({
      id: `${id}:edge`,
      source: agentId,
      target: id,
      relation,
      count: memberEdges.reduce((sum, edge) => sum + edge.count, 0),
      reporterIds: [...new Set(memberEdges.flatMap((edge) => edge.reporterIds))].sort(),
      firstAt: firsts[0] ?? times[0]!,
      lastAt: edgeLasts[edgeLasts.length - 1] ?? lasts[lasts.length - 1]!,
      recent: [],
      bases: [],
    });
  }
  return { graph: { nodes, edges }, groups };
}

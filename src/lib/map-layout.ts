/**
 * Where everything sits. Deterministic: the same nodes and edges give the same coordinates on the
 * server and in the browser, whatever order they arrive in, so the picture never jumps between loads.
 *
 * `layoutPicture` is the structured picture: principals and their sources down the centre, each
 * source's reach to the left, what sources saw to the right. `layoutFree` is a seeded force layout for
 * the agent-to-agent lens. Both run d3-force synchronously for a fixed number of ticks.
 * Pure and client-safe. See docs/MAP.md, section 3.
 */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { EntityKind } from "./domain";
import { kindOrder, type NodeRole } from "./map-model";
import type { MapNode } from "./network-map";

export interface Point {
  x: number;
  y: number;
}

/** Which part of the picture a node is in; the label goes on the side edges do not arrive from. */
export type Slot = "person" | "source" | "reach" | "seen" | "free";

export interface LayoutNode extends Point {
  id: string;
  slot: Slot;
}

export interface LayoutHeader extends Point {
  key: "reach" | "sources" | "seen";
  anchor: "start" | "middle" | "end";
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapLayout {
  mode: "picture" | "free";
  nodes: Map<string, LayoutNode>;
  headers: LayoutHeader[];
  bounds: Bounds;
}

export interface LayoutLink {
  source: string;
  target: string;
}

export const LAYOUT = {
  personDx: -54,
  reachX: -240,
  reachFarX: -440,
  seenX: 240,
  seenFarX: 450,
  row: 46,
  agentRow: 94,
  personRow: 60,
  groupGap: 26,
  /** Past this many nodes the left column splits into two staggered sub-columns. */
  zigzagOver: 10,
  /** The most room a label takes beside or under its glyph, for bounds and collision. */
  labelWidth: 176,
  /** Labels longer than this are clipped when drawn. */
  labelChars: 24,
  ticks: 240,
  freeTicks: 300,
} as const;

export function glyphRadius(kind: EntityKind, isSourceNode = false): number {
  if (kind === "agent") return isSourceNode ? 18 : 16;
  if (kind === "person") return 12;
  if (kind === "credential") return 16;
  return 14;
}

/** FNV-1a, for seeding. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32): the simulation's only source of randomness. */
export function seededRandom(seed: string): () => number {
  let state = hash(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

interface SimNode extends SimulationNodeDatum {
  id: string;
  /** The y a node is drawn towards: the middle of what it is connected to. */
  home: number;
  column: number | null;
}

/** Roughly how wide a node's two-line label is drawn, without measuring text. */
export function labelWidth(label: string): number {
  return Math.min(LAYOUT.labelWidth, Math.max(104, Math.min(label.length, LAYOUT.labelChars) * 7.8));
}

function boundsOf(nodes: Iterable<LayoutNode>, headers: LayoutHeader[], labels: ReadonlyMap<string, string> = new Map()): Bounds {
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    bounds.minX = Math.min(bounds.minX, x0);
    bounds.minY = Math.min(bounds.minY, y0);
    bounds.maxX = Math.max(bounds.maxX, x1);
    bounds.maxY = Math.max(bounds.maxY, y1);
  };
  for (const node of nodes) {
    const label = labels.get(node.id);
    const w = label === undefined ? LAYOUT.labelWidth : labelWidth(label);
    switch (node.slot) {
      case "reach":
        grow(node.x - w - 24, node.y - 24, node.x + 24, node.y + 24);
        break;
      case "seen":
        grow(node.x - 24, node.y - 24, node.x + w + 24, node.y + 24);
        break;
      case "person":
        grow(node.x - 20, node.y - 20, node.x + w, node.y + 20);
        break;
      default:
        grow(node.x - w / 2, node.y - 26, node.x + w / 2, node.y + 52);
    }
  }
  for (const header of headers) grow(header.x - 90, header.y - 16, header.x + 90, header.y + 8);
  if (!Number.isFinite(bounds.minX)) return { minX: -200, minY: -120, maxX: 200, maxY: 120 };
  return bounds;
}

/** Keeps a column's nodes at least `gap` apart without changing their order much. */
function spaceColumn(nodes: SimNode[], gap: number, passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    nodes.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || a.id.localeCompare(b.id));
    for (let i = 1; i < nodes.length; i += 1) {
      const above = nodes[i - 1]!;
      const below = nodes[i]!;
      const overlap = gap - ((below.y ?? 0) - (above.y ?? 0));
      if (overlap > 0) {
        above.y = (above.y ?? 0) - overlap / 2;
        below.y = (below.y ?? 0) + overlap / 2;
      }
    }
  }
}

/** A final strict pass: exactly `gap` or more between neighbours, keeping the column's centre. */
function settleColumn(nodes: SimNode[], gap: number): void {
  if (nodes.length === 0) return;
  nodes.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || a.id.localeCompare(b.id));
  const before = nodes.reduce((sum, node) => sum + (node.y ?? 0), 0) / nodes.length;
  for (let i = 1; i < nodes.length; i += 1) {
    const floor = (nodes[i - 1]!.y ?? 0) + gap;
    if ((nodes[i]!.y ?? 0) < floor) nodes[i]!.y = floor;
  }
  const after = nodes.reduce((sum, node) => sum + (node.y ?? 0), 0) / nodes.length;
  for (const node of nodes) node.y = (node.y ?? 0) - (after - before);
}

export interface PictureInput {
  nodes: readonly MapNode[];
  edges: readonly { source: string; target: string; relation: string }[];
}

/**
 * The structured picture. `roles` should come from the whole map's index, so a node keeps its side
 * when a lens hides the edges that put it there.
 */
export function layoutPicture(view: PictureInput, roles: ReadonlyMap<string, NodeRole>): MapLayout {
  const nodes = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = view.edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target) && edge.source !== edge.target)
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.relation.localeCompare(b.relation));
  const role = (id: string): NodeRole => roles.get(id) ?? "sighting";
  const out = new Map<string, LayoutNode>();

  // The spine: each principal, with its agents beneath, in the order their first agent appeared.
  const principalOf = new Map<string, string>();
  for (const edge of edges) {
    if (edge.relation !== "works_for" || role(edge.source) !== "source" || role(edge.target) !== "principal") continue;
    if (!principalOf.has(edge.source)) principalOf.set(edge.source, edge.target);
  }
  interface Group {
    key: string;
    person: MapNode | null;
    agents: MapNode[];
  }
  const groups = new Map<string, Group>();
  const groupFor = (key: string): Group => {
    let group = groups.get(key);
    if (!group) {
      group = { key, person: byId.get(key) ?? null, agents: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const node of nodes) {
    if (role(node.id) === "principal") groupFor(node.id);
    else if (role(node.id) === "source") groupFor(principalOf.get(node.id) ?? "~none").agents.push(node);
  }
  const since = (group: Group) => {
    const times = group.agents.map((agent) => agent.firstSeenAt).sort();
    return times[0] ?? group.person?.firstSeenAt ?? "";
  };
  const ordered = [...groups.values()].sort((a, b) => since(a).localeCompare(since(b)) || a.key.localeCompare(b.key));
  let cursor = 0;
  for (const group of ordered) {
    if (group.person) {
      out.set(group.person.id, { id: group.person.id, slot: "person", x: LAYOUT.personDx, y: cursor });
      cursor += LAYOUT.personRow;
    }
    group.agents.sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
    for (const agent of group.agents) {
      out.set(agent.id, { id: agent.id, slot: "source", x: 0, y: cursor });
      cursor += LAYOUT.agentRow;
    }
    cursor += LAYOUT.groupGap;
  }
  const spineYs = [...out.values()].map((node) => node.y);
  const spineShift = spineYs.length > 0 ? (Math.min(...spineYs) + Math.max(...spineYs)) / 2 : 0;
  for (const node of out.values()) node.y -= spineShift;

  // The sides. Each node's home is the middle of what it connects to: first the spine, then each other.
  const neighbours = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    neighbours.get(edge.source)?.push(edge.target);
    neighbours.get(edge.target)?.push(edge.source);
  }
  const side = nodes.filter((node) => !out.has(node.id));
  const home = new Map<string, number>();
  const near = new Set<string>();
  for (const node of side) {
    const ys = (neighbours.get(node.id) ?? []).flatMap((id) => (out.has(id) ? [out.get(id)!.y] : []));
    if (ys.length > 0) {
      home.set(node.id, ys.reduce((sum, y) => sum + y, 0) / ys.length);
      near.add(node.id);
    }
  }
  for (let round = 0; round < 3; round += 1) {
    for (const node of side) {
      if (home.has(node.id)) continue;
      const ys = (neighbours.get(node.id) ?? []).flatMap((id) => (home.has(id) ? [home.get(id)!] : []));
      if (ys.length > 0) home.set(node.id, ys.reduce((sum, y) => sum + y, 0) / ys.length);
    }
  }

  const columns = new Map<number, SimNode[]>();
  const sim: SimNode[] = [];
  const zigzag = side.filter((node) => role(node.id) === "reach").length > LAYOUT.zigzagOver;
  const columnGap = (x: number) => (zigzag && x === LAYOUT.reachX ? LAYOUT.row * 0.56 : LAYOUT.row);
  for (const node of side) {
    const isReach = role(node.id) === "reach";
    // A sighting no source touches directly is hearsay one hop out: the far column.
    const x = isReach ? LAYOUT.reachX : near.has(node.id) || (neighbours.get(node.id) ?? []).length === 0 ? LAYOUT.seenX : LAYOUT.seenFarX;
    const entry: SimNode = { id: node.id, home: home.get(node.id) ?? 0, column: x, x, fx: x, y: 0 };
    sim.push(entry);
    columns.set(x, [...(columns.get(x) ?? []), entry]);
  }
  for (const [x, column] of columns) {
    column.sort((a, b) => a.home - b.home || kindOrder(byId.get(a.id)!.kind) - kindOrder(byId.get(b.id)!.kind) || a.id.localeCompare(b.id));
    const centre = column.reduce((sum, node) => sum + node.home, 0) / column.length;
    const gap = columnGap(x);
    column.forEach((node, i) => {
      node.y = centre + (i - (column.length - 1) / 2) * gap;
    });
  }
  for (const node of out.values()) sim.push({ id: node.id, home: node.y, column: null, x: node.x, y: node.y, fx: node.x, fy: node.y });

  if (side.length > 0) {
    const simById = new Map(sim.map((node) => [node.id, node]));
    const links: SimulationLinkDatum<SimNode>[] = edges.map((edge) => ({ source: simById.get(edge.source)!, target: simById.get(edge.target)! }));
    const spacing = () => {
      for (const [x, column] of columns) spaceColumn(column, columnGap(x), 2);
    };
    const simulation = forceSimulation(sim)
      .randomSource(seededRandom(nodes.map((node) => node.id).join("|")))
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
          .distance((link) => Math.abs(((link.source as SimNode).x ?? 0) - ((link.target as SimNode).x ?? 0)))
          .strength(0.1),
      )
      .force("home", forceY<SimNode>((node) => node.home).strength(0.04))
      .force("spacing", spacing)
      .stop();
    simulation.tick(LAYOUT.ticks);
    for (const [x, column] of columns) settleColumn(column, columnGap(x));
  }

  for (const [x, column] of columns) {
    const isReach = x === LAYOUT.reachX;
    column.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || a.id.localeCompare(b.id));
    column.forEach((node, i) => {
      const far = zigzag && isReach && i % 2 === 1;
      out.set(node.id, { id: node.id, slot: isReach ? "reach" : "seen", x: far ? LAYOUT.reachFarX : x, y: node.y ?? 0 });
    });
  }
  for (const node of out.values()) {
    node.x = round(node.x);
    node.y = round(node.y);
  }

  const all = [...out.values()];
  const top = all.length > 0 ? Math.min(...all.map((node) => node.y)) - 58 : 0;
  const headers: LayoutHeader[] = [];
  if (all.some((node) => node.slot === "reach")) headers.push({ key: "reach", x: LAYOUT.reachX + 14, y: top, anchor: "end" });
  if (all.some((node) => node.slot === "source" || node.slot === "person")) headers.push({ key: "sources", x: -20, y: top, anchor: "middle" });
  if (all.some((node) => node.slot === "seen")) headers.push({ key: "seen", x: LAYOUT.seenX - 14, y: top, anchor: "start" });
  return { mode: "picture", nodes: out, headers, bounds: boundsOf(all, headers, new Map(nodes.map((node) => [node.id, node.label]))) };
}

/** A seeded force layout with no columns, for small graphs such as agent to agent. */
export function layoutFree(nodeIds: readonly string[], links: readonly LayoutLink[]): MapLayout {
  const ids = [...new Set(nodeIds)].sort();
  const known = new Set(ids);
  const sim: SimNode[] = ids.map((id, i) => {
    // A sunflower spiral: spread out, and the same every time.
    const radius = 90 * Math.sqrt(i + 0.5);
    const angle = i * 2.399963229728653;
    return { id, home: 0, column: null, x: radius * Math.cos(angle), y: radius * Math.sin(angle) * 0.7 };
  });
  const simById = new Map(sim.map((node) => [node.id, node]));
  const simLinks: SimulationLinkDatum<SimNode>[] = [...links]
    .filter((link) => known.has(link.source) && known.has(link.target) && link.source !== link.target)
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .map((link) => ({ source: simById.get(link.source)!, target: simById.get(link.target)! }));

  const boxW = LAYOUT.labelWidth + 14;
  const boxH = 96;
  const boxes = () => {
    for (let i = 0; i < sim.length; i += 1) {
      for (let j = i + 1; j < sim.length; j += 1) {
        const a = sim[i]!;
        const b = sim[j]!;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const ox = boxW - Math.abs(dx);
        const oy = boxH - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (ox / boxW < oy / boxH) {
          const push = (ox / 2) * (dx < 0 ? -1 : 1);
          a.x = (a.x ?? 0) - push;
          b.x = (b.x ?? 0) + push;
        } else {
          const push = (oy / 2) * (dy < 0 ? -1 : 1);
          a.y = (a.y ?? 0) - push;
          b.y = (b.y ?? 0) + push;
        }
      }
    }
  };
  if (sim.length > 1) {
    const simulation = forceSimulation(sim)
      .randomSource(seededRandom(ids.join("|")))
      .force("link", forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks).distance(250).strength(0.3))
      .force("charge", forceManyBody<SimNode>().strength(-700).distanceMax(900))
      .force("x", forceX<SimNode>(0).strength(0.05))
      .force("y", forceY<SimNode>(0).strength(0.09))
      .force("boxes", boxes)
      .stop();
    simulation.tick(LAYOUT.freeTicks);
    for (let pass = 0; pass < 8; pass += 1) boxes();
  }
  const out = new Map<string, LayoutNode>();
  for (const node of sim) out.set(node.id, { id: node.id, slot: "free", x: round(node.x ?? 0), y: round(node.y ?? 0) });
  return { mode: "free", nodes: out, headers: [], bounds: boundsOf(out.values(), []) };
}

export type Direction = "up" | "down" | "left" | "right";

const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** The nearest node in a direction, for arrow keys. Prefers what is straight ahead over what is merely close. */
export function nearestInDirection(layout: MapLayout, fromId: string, direction: Direction, among?: ReadonlySet<string>): string | null {
  const from = layout.nodes.get(fromId);
  if (!from) return null;
  const v = VECTORS[direction];
  let best: string | null = null;
  let bestScore = Infinity;
  for (const node of layout.nodes.values()) {
    if (node.id === fromId || (among && !among.has(node.id))) continue;
    const dx = node.x - from.x;
    const dy = node.y - from.y;
    const along = dx * v.x + dy * v.y;
    if (along <= 0.5) continue;
    const across = Math.abs(dx * v.y) + Math.abs(dy * v.x);
    const score = along + across * 2.5;
    if (score < bestScore || (score === bestScore && best !== null && node.id < best)) {
      best = node.id;
      bestScore = score;
    }
  }
  return best;
}

export interface EdgeGeometry {
  d: string;
  /** Where a label for the edge sits. */
  mid: Point;
}

/** The curve between two placed nodes, stopping at each glyph's edge. */
export function edgeGeometry(from: LayoutNode, to: LayoutNode, fromR: number, toR: number): EdgeGeometry {
  const f = (value: number) => String(round(value));
  // An agent to its principal: a tree bracket, out to the trunk and up.
  if (from.slot === "source" && to.slot === "person") {
    const corner = Math.min(10, Math.abs(from.y - to.y) / 2);
    const up = to.y < from.y ? -1 : 1;
    return {
      d: `M${f(from.x - fromR)},${f(from.y)} H${f(to.x + corner)} Q${f(to.x)},${f(from.y)} ${f(to.x)},${f(from.y + up * corner)} V${f(to.y - up * toR)}`,
      mid: { x: to.x, y: (from.y + to.y) / 2 },
    };
  }
  if (from.slot === "free" || to.slot === "free") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const x1 = from.x + ux * fromR;
    const y1 = from.y + uy * fromR;
    const x2 = to.x - ux * (toR + 3);
    const y2 = to.y - uy * (toR + 3);
    return { d: `M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }
  if (Math.abs(to.x - from.x) < 1) {
    // Same column: bow towards the centre, where there are no labels.
    const inward = from.x > 0 ? -1 : 1;
    const bow = inward * Math.min(90, 30 + Math.abs(to.y - from.y) * 0.35);
    const x1 = from.x + inward * fromR;
    const x2 = to.x + inward * (toR + 3);
    return {
      d: `M${f(x1)},${f(from.y)} C${f(x1 + bow)},${f(from.y)} ${f(x2 + bow)},${f(to.y)} ${f(x2)},${f(to.y)}`,
      mid: { x: (x1 + x2) / 2 + bow * 0.75, y: (from.y + to.y) / 2 },
    };
  }
  const s = to.x > from.x ? 1 : -1;
  const x1 = from.x + s * fromR;
  const x2 = to.x - s * (toR + 3);
  const cx = (x1 + x2) / 2;
  return {
    d: `M${f(x1)},${f(from.y)} C${f(cx)},${f(from.y)} ${f(cx)},${f(to.y)} ${f(x2)},${f(to.y)}`,
    mid: { x: cx, y: (from.y + to.y) / 2 },
  };
}

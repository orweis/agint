/**
 * Time replay: the moments at which the picture changed, and the picture as it was at one of them.
 * Builds on `mapAt`, and also rewinds the states that can be derived from timestamps, so a lead can be
 * watched becoming a source and a lead being corroborated. Pure and client-safe. See docs/MAP.md, section 6.
 */
import { isMention } from "./map-model";
import { mapAt, type MapNode, type NetworkMap } from "./network-map";

export interface Moment {
  at: string;
  /** Nodes first seen at this moment. */
  nodeIds: string[];
  /** Edges first reported at this moment. */
  edgeIds: string[];
  /** Agents that connected (became sources) at this moment. */
  connectedIds: string[];
  /** Nodes whose second independent reporter arrived at this moment. */
  corroboratedIds: string[];
  /** One line on what happened: "release-assistant connected". */
  caption: string;
}

/** Agent ids that had reported an edge touching `nodeId` by `at`, other than the node itself. */
function reportersBy(map: NetworkMap, node: MapNode, at: string): Set<string> {
  const own = node.source?.agentId ?? null;
  const reporters = new Set<string>();
  for (const edge of map.edges) {
    if (edge.firstAt > at || isMention(edge) || (edge.source !== node.id && edge.target !== node.id)) continue;
    for (const id of edge.reporterIds) {
      if (id !== own && id !== node.id) reporters.add(id);
    }
  }
  return reporters;
}

/** When a corroborated node got its second reporter, or null if the edges do not say. */
function corroboratedAt(map: NetworkMap, node: MapNode): string | null {
  const firstBy = new Map<string, string>();
  const own = node.source?.agentId ?? null;
  for (const edge of map.edges) {
    if (isMention(edge) || (edge.source !== node.id && edge.target !== node.id)) continue;
    for (const id of edge.reporterIds) {
      if (id === own || id === node.id) continue;
      const seen = firstBy.get(id);
      if (seen === undefined || edge.firstAt < seen) firstBy.set(id, edge.firstAt);
    }
  }
  const times = [...firstBy.values()].sort();
  return times[1] ?? null;
}

function listLabels(labels: string[]): string {
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`;
}

/** Every distinct time something first appeared, connected or was corroborated, oldest first. */
export function moments(map: NetworkMap): Moment[] {
  const byTime = new Map<string, Moment>();
  const at = (time: string): Moment => {
    let moment = byTime.get(time);
    if (!moment) {
      moment = { at: time, nodeIds: [], edgeIds: [], connectedIds: [], corroboratedIds: [], caption: "" };
      byTime.set(time, moment);
    }
    return moment;
  };
  const labels = new Map(map.nodes.map((node) => [node.id, node.label]));
  for (const node of map.nodes) {
    at(node.firstSeenAt).nodeIds.push(node.id);
    if (node.state === "source" && node.source) at(node.source.firstSeenAt).connectedIds.push(node.id);
    if (node.state === "corroborated") {
      const when = corroboratedAt(map, node);
      if (when !== null) at(when).corroboratedIds.push(node.id);
    }
  }
  for (const edge of map.edges) at(edge.firstAt).edgeIds.push(edge.id);

  const list = [...byTime.values()].sort((a, b) => a.at.localeCompare(b.at));
  for (const moment of list) {
    const name = (id: string) => labels.get(id) ?? id;
    const parts: string[] = [];
    if (moment.connectedIds.length > 0) parts.push(`${listLabels(moment.connectedIds.map(name))} connected`);
    if (moment.corroboratedIds.length > 0) parts.push(`${listLabels(moment.corroboratedIds.map(name))} corroborated`);
    const fresh = moment.nodeIds.filter((id) => !moment.connectedIds.includes(id));
    if (fresh.length > 0) parts.push(`+ ${listLabels(fresh.map(name))}`);
    if (parts.length === 0) parts.push(moment.edgeIds.length === 1 ? "1 new connection" : `${moment.edgeIds.length} new connections`);
    moment.caption = parts.join(" · ");
  }
  return list;
}

/**
 * The map as it looked at `at`. Unlike `mapAt`, an agent that had not yet connected is a lead, and a
 * node whose second reporter had not yet arrived is a lead. Traced and dismissed stay as they are today.
 */
export function replayAt(map: NetworkMap, at: string): NetworkMap {
  const then = mapAt(map, at);
  const live = at >= map.generatedAt;
  const nodes = then.nodes.map((node): MapNode => {
    if (node.state === "source" && node.source && node.source.firstSeenAt > at) {
      return { ...node, state: "lead", source: null, signals: node.signals.filter((signal) => signal !== "stale_source") };
    }
    if (node.state === "source" && !live && node.signals.includes("stale_source")) {
      return { ...node, signals: node.signals.filter((signal) => signal !== "stale_source") };
    }
    if (node.state === "corroborated") {
      const reporters = reportersBy(then, node, at).size;
      if (reporters < 2) return { ...node, state: "lead", reporterCount: Math.min(node.reporterCount, Math.max(reporters, 1)) };
    }
    return node;
  });
  return { ...then, nodes };
}

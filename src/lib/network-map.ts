/**
 * The read model behind the map: every node and edge AGINT knows in one network, with provenance.
 * Built on the server by `getNetworkMap` (`server/domain/map.ts`); laid out and drawn on the client.
 * Client-safe: plain data and pure helpers only.
 */
import type { EntityKind, EntityState, Relation, Runtime, SightingBasis, Signal } from "./domain";

/** What an enrolled agent (a source) says about itself. Present only on `agent` nodes that connected. */
export interface SourceProfile {
  agentId: string;
  harness: string;
  model: string | null;
  runtime: Runtime;
  host: string | null;
  principalName: string | null;
  task: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  checkedOutAt: string | null;
  reportCount: number;
}

export interface MapNode {
  id: string;
  kind: EntityKind;
  /** Display name, as reported (never a secret: values are withheld before storage). */
  label: string;
  /** Normalized identity within its kind, e.g. `github.com/acme/api`, `notes-sync`, `OPENAI_API_KEY@.env`. */
  ref: string;
  state: EntityState;
  /** Distinct agents that reported this node (other than itself). */
  reporterCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  signals: Signal[];
  /** Small, kind-specific facts as reported (location of a key, url of a server, harness of an unknown agent). */
  attributes: Record<string, string>;
  source: SourceProfile | null;
}

export interface MapEdge {
  id: string;
  /** Usually the reporting agent's node. */
  source: string;
  target: string;
  relation: Relation;
  /** How many reports back this edge. */
  count: number;
  /** Agent ids that reported it: an edge seen by two agents is corroborated. */
  reporterIds: string[];
  firstAt: string;
  lastAt: string;
  /** Most recent reported summaries, newest first (at most 3). */
  recent: string[];
  /**
   * For sightings: how the reporters know, strongest first (`accessed`, `running`, `configured`,
   * `mentioned`). Empty for an agent's own activity. "Configured" is not "accessed".
   */
  bases: SightingBasis[];
}

export interface NetworkMap {
  nodes: MapNode[];
  edges: MapEdge[];
  generatedAt: string;
  /** Earliest event in the network, for the time scrubber. */
  since: string | null;
}

export function nodeIndex(map: Pick<NetworkMap, "nodes">): Map<string, MapNode> {
  return new Map(map.nodes.map((node) => [node.id, node]));
}

/** The map as it looked at `at`: nodes and edges first seen by then. States are today's. */
export function mapAt(map: NetworkMap, at: string): NetworkMap {
  const nodes = map.nodes.filter((node) => node.firstSeenAt <= at);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = map.edges.filter((edge) => edge.firstAt <= at && ids.has(edge.source) && ids.has(edge.target));
  return { ...map, nodes, edges };
}

const SIGHTING_RELATIONS = new Set<Relation>(["sees", "shares_job"]);

/**
 * Whether a node is something a source saw rather than something in a source's own reach: another agent,
 * anything reported through a sighting, or anything carrying a signal. These are what need a person; the
 * routine reach of a source (its repo, its tools, its host) is a claim too, but not a finding.
 */
export function isSighted(node: MapNode, edges: readonly MapEdge[]): boolean {
  if (node.state === "source") return false;
  if (node.kind === "agent" || node.signals.length > 0) return true;
  return edges.some((edge) => edge.target === node.id && SIGHTING_RELATIONS.has(edge.relation));
}

/** Open findings that need a person: sighted, and still a lead or corroborated. */
export function openFindings(map: Pick<NetworkMap, "nodes" | "edges">): MapNode[] {
  return map.nodes.filter((node) => (node.state === "lead" || node.state === "corroborated") && isSighted(node, map.edges));
}

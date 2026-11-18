/**
 * Signals derived from the map. They point a person at something worth a look; they never grant or
 * deny anything (policy stays the ceiling: no score grants access).
 */
import { STALE_SOURCE_HOURS, type Signal } from "./domain";
import type { MapEdge, MapNode } from "./network-map";

type NodeInput = Omit<MapNode, "signals">;

export function deriveSignals(nodes: NodeInput[], edges: Pick<MapEdge, "source" | "target" | "relation">[], now: Date): Map<string, Signal[]> {
  const out = new Map<string, Signal[]>();
  const add = (id: string, signal: Signal) => {
    const list = out.get(id) ?? [];
    if (!list.includes(signal)) list.push(signal);
    out.set(id, list);
  };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const holders = new Map<string, Set<string>>();
  const attributed = new Set<string>();

  for (const edge of edges) {
    const target = byId.get(edge.target);
    if (!target) continue;
    if (target.kind === "credential") {
      if (edge.relation === "sees") add(target.id, "unissued_credential");
      if (edge.relation === "holds") holders.set(target.id, (holders.get(target.id) ?? new Set()).add(edge.source));
    }
    if (edge.relation === "works_for") attributed.add(edge.source);
    if (edge.relation === "deploys" || (edge.relation === "writes" && (target.kind === "service" || target.kind === "data_store"))) add(edge.source, "privileged_reach");
  }
  for (const [credential, set] of holders) if (set.size > 1) add(credential, "shared_credential");

  const staleBefore = now.getTime() - STALE_SOURCE_HOURS * 3_600_000;
  for (const node of nodes) {
    if (node.state === "dismissed") continue;
    if (node.kind === "mcp_server" && node.state !== "traced") add(node.id, "shadow_mcp");
    if (node.kind === "agent" && node.state !== "source" && node.state !== "traced") add(node.id, "unknown_agent");
    if (node.source) {
      if (!attributed.has(node.id)) add(node.id, "unattributed_agent");
      if (!node.source.checkedOutAt && new Date(node.source.lastSeenAt).getTime() < staleBefore) add(node.id, "stale_source");
    }
  }
  return out;
}

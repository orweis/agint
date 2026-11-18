import { describe, expect, it } from "vitest";

import { ENTITY_STATE_META } from "@/lib/domain";
import { emptyMap, largeMap, northstarMap } from "@/lib/fixtures/northstar-map";
import { LAYOUT, edgeGeometry, layoutFree, layoutPicture, nearestInDirection, seededRandom } from "@/lib/map-layout";
import { LENSES, NO_FILTERS, NO_PRINCIPAL, agentOverlaps, applyFilters, applyLens, collapseLeaves, matchesQuery, principalGroups, principals, searchMatches } from "@/lib/map-lens";
import { accessOf, attentionList, connectionsOf, countMap, edgeClass, edgeRows, formatAgo, formatWhen, indexMap, neighborhood, nextSteps, nodeAriaLabel, nodeRows, nodeSubtitle, reportersOf, roleOf } from "@/lib/map-model";
import { moments, replayAt } from "@/lib/map-replay";
import type { MapNode, NetworkMap } from "@/lib/network-map";

const map = northstarMap;
const index = indexMap(map);
const node = (id: string): MapNode => {
  const found = index.byId.get(id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};
const ids = (nodes: readonly MapNode[]) => nodes.map((n) => n.id).sort();

describe("the Northstar fixture", () => {
  it("is a well-formed map", () => {
    const seen = new Set<string>();
    for (const n of map.nodes) {
      expect(seen.has(n.id), n.id).toBe(false);
      seen.add(n.id);
      expect(n.firstSeenAt <= n.lastSeenAt, n.id).toBe(true);
      expect(n.lastSeenAt <= map.generatedAt, n.id).toBe(true);
    }
    for (const e of map.edges) {
      expect(seen.has(e.source) && seen.has(e.target), e.id).toBe(true);
      expect(e.firstAt <= e.lastAt, e.id).toBe(true);
      expect(e.reporterIds.length).toBeGreaterThan(0);
      for (const reporter of e.reporterIds) expect(index.byAgentId.has(reporter), reporter).toBe(true);
      expect(e.recent.length).toBeLessThanOrEqual(3);
    }
    expect(map.since).toBe(map.nodes.map((n) => n.firstSeenAt).sort()[0]);
  });

  it("never carries a secret's value", () => {
    for (const n of map.nodes.filter((n) => n.kind === "credential")) {
      expect(n.attributes.value).toBe("withheld");
    }
  });

  it("tells the story's states", () => {
    expect(node("ent_release").state).toBe("source");
    expect(node("ent_cursor").state).toBe("source");
    expect(node("ent_key_openai")).toMatchObject({ state: "lead", signals: ["unissued_credential"] });
    expect(node("ent_mcp_notes")).toMatchObject({ state: "corroborated", reporterCount: 2 });
    expect(node("ent_billing")).toMatchObject({ state: "lead", signals: ["unknown_agent"] });
    expect(node("ent_deploy").state).toBe("reference");
    expect(node("ent_data").signals).toContain("stale_source");
  });
});

describe("roles and edge classes", () => {
  it("puts each node in its part of the picture", () => {
    expect(roleOf(index, "ent_maya")).toBe("principal");
    expect(roleOf(index, "ent_release")).toBe("source");
    expect(roleOf(index, "ent_repo_web")).toBe("reach");
    expect(roleOf(index, "ent_host_maya")).toBe("reach");
    expect(roleOf(index, "ent_job_webci")).toBe("reach");
    expect(roleOf(index, "ent_key_github")).toBe("reach");
    expect(roleOf(index, "ent_key_openai")).toBe("sighting");
    expect(roleOf(index, "ent_mcp_notes")).toBe("sighting");
    expect(roleOf(index, "ent_billing")).toBe("sighting");
    expect(roleOf(index, "ent_crm")).toBe("sighting");
  });

  it("classes edges by what they claim", () => {
    const cls = (source: string, target: string) => {
      const edge = map.edges.find((e) => e.source === source && e.target === target);
      if (!edge) throw new Error(`no edge ${source} -> ${target}`);
      return edgeClass(edge, index);
    };
    expect(cls("ent_release", "ent_maya")).toBe("context");
    expect(cls("ent_release", "ent_host_maya")).toBe("context");
    expect(cls("ent_release", "ent_repo_web")).toBe("reach");
    expect(cls("ent_release", "ent_key_openai")).toBe("sighting");
    expect(cls("ent_billing", "ent_job_webci")).toBe("sighting");
    expect(cls("ent_support", "ent_billing")).toBe("mention");
    expect(cls("ent_deploy", "ent_crm")).toBe("mention");
  });
});

describe("counters", () => {
  const counters = countMap(map, index);

  it("counts by state and keeps references out of Mapped", () => {
    const by = (state: string) => map.nodes.filter((n) => n.state === state).length;
    expect(counters.sources).toBe(4);
    expect(counters.leads).toBe(by("lead"));
    expect(counters.corroborated).toBe(4);
    expect(counters.traced).toBe(1);
    expect(counters.references).toBe(3);
    expect(counters.mapped).toBe(map.nodes.length - 3);
    expect(counters.mapped).toBe(counters.sources + counters.leads + counters.corroborated + counters.traced);
  });

  it("shows sources against the agents seen, not against a guess", () => {
    expect(counters.agentsSeen).toBe(5);
    expect(counters.quietSources).toBe(1);
    expect(counters.reports).toBe(38 + 14 + 9 + 26);
  });

  it("is all zeroes for an empty network", () => {
    expect(Object.values(countMap(emptyMap)).every((value) => value === 0)).toBe(true);
  });

  it("lists what needs a person, most serious first", () => {
    const list = attentionList(map, index);
    expect(ids(list)).toEqual(["ent_billing", "ent_key_openai", "ent_mcp_figma", "ent_mcp_notes"]);
    expect(list[0]?.id).toBe("ent_key_openai");
    expect(counters.attention).toBe(4);
  });
});

describe("focus", () => {
  it("finds a node's one-hop neighbourhood", () => {
    const hood = neighborhood(index, "ent_mcp_notes");
    expect([...hood.nodeIds].sort()).toEqual(["ent_mcp_notes", "ent_release", "ent_support"]);
    expect(hood.edgeIds.size).toBe(2);
    expect(neighborhood(index, "nope").nodeIds.size).toBe(0);
  });

  it("names who saw a node, and does not count a mention", () => {
    expect(reportersOf(index, "ent_mcp_notes").map((r) => r.label)).toEqual(["release-assistant", "support-summarizer"]);
    expect(reportersOf(index, "ent_billing").map((r) => r.label)).toEqual(["release-assistant"]);
    expect(reportersOf(index, "ent_release")).toEqual([]);
    const first = reportersOf(index, "ent_mcp_notes")[0];
    expect(first!.firstAt < first!.lastAt).toBe(true);
  });

  it("separates used from seen from mentioned", () => {
    const notes = accessOf(index, "ent_mcp_notes");
    expect(notes.usedBy).toEqual([]);
    expect(ids(notes.seenBy)).toEqual(["ent_release", "ent_support"]);
    expect(notes.bases).toEqual(["configured"]);
    const repo = accessOf(index, "ent_repo_web");
    expect(ids(repo.usedBy)).toEqual(["ent_cursor", "ent_release"]);
    const billing = accessOf(index, "ent_billing");
    expect(ids(billing.seenBy)).toEqual(["ent_release"]);
    expect(ids(billing.mentionedBy)).toEqual(["ent_support"]);
    expect(billing.bases).toEqual(["running", "mentioned"]);
  });

  it("writes each connection as a sentence with its reporters", () => {
    const connections = connectionsOf(index, "ent_key_openai");
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ sentence: "release-assistant sees OPENAI_API_KEY", reporters: ["release-assistant"], outgoing: false, cls: "sighting" });
  });

  it("offers a lead its three ways out", () => {
    expect(nextSteps(node("ent_billing")).map((s) => s.id)).toEqual(["connect", "second_source", "trace", "dismiss"]);
    expect(nextSteps(node("ent_key_openai")).map((s) => s.id)).toEqual(["second_source", "trace", "dismiss"]);
    expect(nextSteps(node("ent_mcp_notes")).map((s) => s.id)).toEqual(["trace", "dismiss"]);
    expect(nextSteps(node("ent_deploy")).map((s) => s.id)).toEqual(["sighting", "connect"]);
    expect(nextSteps(node("ent_data")).map((s) => s.id)).toEqual(["check_in"]);
    expect(nextSteps(node("ent_release"))).toEqual([]);
  });
});

describe("lenses", () => {
  it("Picture is everything", () => {
    const view = applyLens(map, "picture", {}, index);
    expect(view.nodes).toHaveLength(map.nodes.length);
    expect(view.edges).toHaveLength(map.edges.length);
  });

  it("Agents keeps agents, their direct links and what they share", () => {
    const view = applyLens(map, "agents", {}, index);
    expect(view.nodes.every((n) => n.kind === "agent")).toBe(true);
    expect(view.nodes).toHaveLength(6);
    expect(view.edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(["ent_release>ent_billing", "ent_release>ent_cursor", "ent_support>ent_billing", "ent_support>ent_deploy"]);
    const shared = view.overlaps.find((o) => o.a === "ent_cursor" && o.b === "ent_release");
    expect(shared?.via).toEqual(["ent_host_maya", "ent_maya", "ent_repo_web"]);
    expect(view.overlaps.find((o) => o.a === "ent_release" && o.b === "ent_support")?.via).toEqual(["ent_mcp_notes"]);
    expect(view.overlaps.find((o) => o.a === "ent_billing" && o.b === "ent_release")?.via).toEqual(["ent_job_webci"]);
  });

  it("derives overlaps only from things somebody saw", () => {
    for (const overlap of agentOverlaps(map, index)) {
      for (const via of overlap.via) expect(node(via).state).not.toBe("reference");
    }
  });

  it("Reach drops sightings", () => {
    const view = applyLens(map, "reach", {}, index);
    expect(view.nodes.some((n) => roleOf(index, n.id) === "sighting")).toBe(false);
    expect(view.edges.some((e) => e.relation === "sees")).toBe(false);
    expect(ids(view.nodes)).toContain("ent_repo_web");
  });

  it("Exposure keeps what was seen and who reported it", () => {
    const view = applyLens(map, "exposure", {}, index);
    expect(ids(view.nodes)).toEqual(["ent_billing", "ent_bucket", "ent_crm", "ent_cursor", "ent_deploy", "ent_key_openai", "ent_mcp_figma", "ent_mcp_notes", "ent_release", "ent_support"]);
    expect(view.edges.some((e) => e.target === "ent_repo_web")).toBe(false);
  });

  it("By principal shows one person's picture", () => {
    expect(principals(map, index).map((p) => [p.label, p.sources])).toEqual([["Liam Patel", 1], ["Maya Chen", 2], ["Noah Singh", 1]]);
    const maya = applyLens(map, "principal", { principalId: "ent_maya" }, index);
    expect(ids(maya.nodes)).toEqual(["ent_billing", "ent_cursor", "ent_file_env", "ent_host_maya", "ent_job_webci", "ent_key_github", "ent_key_openai", "ent_linear", "ent_maya", "ent_mcp_figma", "ent_mcp_github", "ent_mcp_notes", "ent_release", "ent_repo_web"]);
    const liam = applyLens(map, "principal", { principalId: "ent_liam" }, index);
    expect(ids(liam.nodes)).toContain("ent_crm");
    expect(ids(liam.nodes)).not.toContain("ent_repo_web");
    const groups = principalGroups(map, index);
    expect([...(groups.get("ent_mcp_notes") ?? [])].sort()).toEqual(["ent_liam", "ent_maya"]);
  });

  it("groups an agent with no principal under its own key", () => {
    const orphan: NetworkMap = { ...map, edges: map.edges.filter((e) => !(e.source === "ent_data" && e.relation === "works_for")) };
    const list = principals(orphan);
    expect(list[list.length - 1]).toEqual({ id: NO_PRINCIPAL, label: "No principal", sources: 1 });
    expect(ids(applyLens(orphan, "principal", { principalId: NO_PRINCIPAL }).nodes)).toContain("ent_data");
  });

  it("every lens returns edges whose ends it kept", () => {
    for (const lens of LENSES) {
      const view = applyLens(map, lens, {}, index);
      const kept = new Set(view.nodes.map((n) => n.id));
      for (const e of view.edges) expect(kept.has(e.source) && kept.has(e.target), `${lens} ${e.id}`).toBe(true);
    }
  });
});

describe("filters and search", () => {
  const picture = applyLens(map, "picture", {}, index);

  it("returns the same view when nothing is filtered out", () => {
    expect(applyFilters(picture, NO_FILTERS)).toBe(picture);
  });

  it("filters by kind, state and signal, and drops edges that lose an end", () => {
    const creds = applyFilters(picture, { ...NO_FILTERS, kinds: ["credential"] });
    expect(creds.nodes).toHaveLength(4);
    expect(creds.edges).toHaveLength(0);
    const corroborated = applyFilters(picture, { ...NO_FILTERS, states: ["corroborated", "source"] });
    expect(corroborated.nodes.every((n) => n.state === "corroborated" || n.state === "source")).toBe(true);
    expect(corroborated.edges.length).toBeGreaterThan(0);
    const shadow = applyFilters(picture, { ...NO_FILTERS, signals: ["shadow_mcp"] });
    expect(ids(shadow.nodes)).toEqual(["ent_mcp_figma", "ent_mcp_notes"]);
  });

  it("hides dismissed nodes unless the state is asked for", () => {
    const dismissed: MapNode = { ...node("ent_linear"), id: "ent_gone", state: "dismissed" };
    const view = { nodes: [...map.nodes, dismissed], edges: map.edges, overlaps: [] };
    expect(ids(applyFilters(view, NO_FILTERS).nodes)).not.toContain("ent_gone");
    expect(ids(applyFilters(view, { ...NO_FILTERS, states: ["dismissed"] }).nodes)).toEqual(["ent_gone"]);
  });

  it("searches names, refs, kinds, harnesses, principals and attributes", () => {
    expect(matchesQuery(node("ent_repo_web"), "github.com")).toBe(true);
    expect(matchesQuery(node("ent_release"), "claude code maya")).toBe(true);
    expect(matchesQuery(node("ent_key_openai"), ".env unissued")).toBe(true);
    expect(matchesQuery(node("ent_key_openai"), "snowflake")).toBe(false);
    expect(searchMatches(map.nodes, "  ")).toBeNull();
    expect([...(searchMatches(map.nodes, "mcp server") ?? [])].sort()).toEqual(["ent_mcp_figma", "ent_mcp_github", "ent_mcp_notes"]);
  });
});

describe("replay", () => {
  const list = moments(map);

  it("lists the moments the picture changed, oldest first", () => {
    expect(list[0]?.at).toBe(map.since);
    expect(list.map((m) => m.at)).toEqual([...list.map((m) => m.at)].sort());
    expect(new Set(list.map((m) => m.at)).size).toBe(list.length);
    expect(list.flatMap((m) => m.nodeIds).sort()).toEqual(ids(map.nodes));
    expect(list.flatMap((m) => m.edgeIds)).toHaveLength(map.edges.length);
    expect(list.every((m) => m.caption.length > 0)).toBe(true);
  });

  it("captions a connection and a corroboration", () => {
    expect(list[0]?.caption).toContain("release-assistant connected");
    const connected = list.find((m) => m.connectedIds.includes("ent_cursor"));
    expect(connected?.at).toBe(node("ent_cursor").source?.firstSeenAt);
    expect(connected?.caption).toContain("maya-cursor connected");
    const corroborated = list.find((m) => m.corroboratedIds.includes("ent_mcp_notes"));
    expect(corroborated?.caption).toBe("notes-sync corroborated");
    expect(corroborated?.nodeIds).toEqual([]);
  });

  it("grows: every moment has at least as much as the one before", () => {
    let nodesBefore = 0;
    let mappedBefore = 0;
    for (const moment of list) {
      const then = replayAt(map, moment.at);
      expect(then.nodes.length).toBeGreaterThanOrEqual(nodesBefore);
      const mapped = countMap(then).mapped;
      expect(mapped).toBeGreaterThanOrEqual(mappedBefore);
      nodesBefore = then.nodes.length;
      mappedBefore = mapped;
    }
    expect(replayAt(map, map.generatedAt).nodes).toEqual(map.nodes);
  });

  it("shows a lead before it connected, and a lead before it was corroborated", () => {
    const dayOne = replayAt(map, "2026-11-15T12:00:00.000Z");
    const cursor = dayOne.nodes.find((n) => n.id === "ent_cursor");
    expect(cursor).toMatchObject({ state: "lead", source: null });
    expect(dayOne.nodes.find((n) => n.id === "ent_mcp_notes")?.state).toBe("lead");
    expect(dayOne.nodes.find((n) => n.id === "ent_maya")?.state).toBe("lead");
    expect(countMap(dayOne)).toMatchObject({ sources: 1, corroborated: 0, references: 0 });

    const dayTwo = replayAt(map, "2026-11-16T10:25:00.000Z");
    expect(dayTwo.nodes.find((n) => n.id === "ent_mcp_notes")?.state).toBe("corroborated");
    expect(dayTwo.nodes.find((n) => n.id === "ent_cursor")?.state).toBe("lead");
    expect(replayAt(map, "2026-11-16T16:45:00.000Z").nodes.find((n) => n.id === "ent_cursor")?.state).toBe("source");
  });

  it("does not call a source quiet before it went quiet", () => {
    expect(replayAt(map, "2026-11-16T00:00:00.000Z").nodes.find((n) => n.id === "ent_data")?.signals).toEqual([]);
  });

  it("has no moments for an empty network", () => {
    expect(moments(emptyMap)).toEqual([]);
  });
});

describe("layout", () => {
  const layout = layoutPicture(map, index.roles);

  it("is deterministic, whatever order the map arrives in", () => {
    const again = layoutPicture(map, index.roles);
    const shuffled = layoutPicture({ nodes: [...map.nodes].reverse(), edges: [...map.edges].reverse() }, index.roles);
    expect([...again.nodes.entries()]).toEqual([...layout.nodes.entries()]);
    expect(new Map(shuffled.nodes)).toEqual(new Map(layout.nodes));
    expect(shuffled.bounds).toEqual(layout.bounds);
  });

  it("places every node at finite coordinates inside the bounds", () => {
    expect(layout.nodes.size).toBe(map.nodes.length);
    for (const n of layout.nodes.values()) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y), n.id).toBe(true);
      expect(n.x >= layout.bounds.minX && n.x <= layout.bounds.maxX, n.id).toBe(true);
      expect(n.y >= layout.bounds.minY && n.y <= layout.bounds.maxY, n.id).toBe(true);
    }
  });

  it("puts sources in the centre, reach on the left and sightings on the right", () => {
    for (const n of layout.nodes.values()) {
      const role = roleOf(index, n.id);
      if (role === "source") expect(n.x, n.id).toBe(0);
      if (role === "principal") expect(n.x, n.id).toBe(LAYOUT.personDx);
      if (role === "reach") expect(n.x, n.id).toBeLessThan(-100);
      if (role === "sighting") expect(n.x, n.id).toBeGreaterThan(100);
    }
    expect(layout.nodes.get("ent_crm")?.x).toBe(LAYOUT.seenFarX);
    expect(layout.nodes.get("ent_key_openai")?.x).toBe(LAYOUT.seenX);
    expect(layout.headers.map((h) => h.key)).toEqual(["reach", "sources", "seen"]);
  });

  it("hangs each source under its principal, in order of arrival", () => {
    const y = (id: string) => layout.nodes.get(id)!.y;
    expect(y("ent_maya")).toBeLessThan(y("ent_release"));
    expect(y("ent_release")).toBeLessThan(y("ent_cursor"));
    expect(y("ent_cursor")).toBeLessThan(y("ent_noah"));
    expect(y("ent_data")).toBeLessThan(y("ent_liam"));
  });

  it("never stacks two nodes on top of each other", () => {
    const columns = new Map<number, number[]>();
    for (const n of layout.nodes.values()) columns.set(n.x, [...(columns.get(n.x) ?? []), n.y]);
    for (const [x, ys] of columns) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i += 1) expect(ys[i]! - ys[i - 1]!, `column ${x}`).toBeGreaterThanOrEqual(LAYOUT.row - 0.2);
    }
  });

  it("keeps a node on its side when a lens hides the edges that put it there", () => {
    const exposure = applyLens(map, "exposure", {}, index);
    const view = layoutPicture(exposure, index.roles);
    expect(view.nodes.get("ent_mcp_notes")!.x).toBeGreaterThan(0);
    expect(view.headers.map((h) => h.key)).toEqual(["sources", "seen"]);
  });

  it("lays out the agent graph freely, deterministically and without overlap", () => {
    const view = applyLens(map, "agents", {}, index);
    const links = [...view.edges.map((e) => ({ source: e.source, target: e.target })), ...view.overlaps.map((o) => ({ source: o.a, target: o.b }))];
    const free = layoutFree(view.nodes.map((n) => n.id), links);
    const again = layoutFree(view.nodes.map((n) => n.id).reverse(), [...links].reverse());
    expect(new Map(again.nodes)).toEqual(new Map(free.nodes));
    const placed = [...free.nodes.values()];
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const dx = Math.abs(placed[i]!.x - placed[j]!.x);
        const dy = Math.abs(placed[i]!.y - placed[j]!.y);
        expect(dx > 150 || dy > 80, `${placed[i]!.id} ${placed[j]!.id}`).toBe(true);
      }
    }
  });

  it("handles an empty map and a single node", () => {
    expect(layoutPicture(emptyMap, new Map()).nodes.size).toBe(0);
    expect(layoutFree(["only"], []).nodes.get("only")).toMatchObject({ slot: "free" });
  });

  it("seeds its randomness", () => {
    const a = seededRandom("northstar");
    const b = seededRandom("northstar");
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seededRandom("other")()).not.toBe(first[0]);
  });

  it("moves between nodes with the arrow keys", () => {
    expect(nearestInDirection(layout, "ent_release", "up")).toBe("ent_maya");
    expect(nearestInDirection(layout, "ent_release", "down")).toBe("ent_cursor");
    const right = nearestInDirection(layout, "ent_release", "right");
    expect(roleOf(index, right ?? "")).toBe("sighting");
    const left = nearestInDirection(layout, "ent_release", "left");
    expect(layout.nodes.get(left ?? "")!.x).toBeLessThan(0);
    expect(nearestInDirection(layout, "ent_release", "right", new Set(["ent_maya"]))).toBeNull();
    expect(nearestInDirection(layout, "nope", "up")).toBeNull();
  });

  it("draws edges that stop at the glyphs", () => {
    const from = layout.nodes.get("ent_release")!;
    const to = layout.nodes.get("ent_key_openai")!;
    const geometry = edgeGeometry(from, to, 18, 16);
    expect(geometry.d.startsWith(`M18,${from.y}`)).toBe(true);
    expect(geometry.d.endsWith(`${to.x - 19},${to.y}`)).toBe(true);
    expect(edgeGeometry(from, layout.nodes.get("ent_maya")!, 18, 12).d).toContain("Q");
  });
});

describe("scale", () => {
  const big = largeMap(12, 14);

  it("leaves a small map alone", () => {
    const { graph, groups } = collapseLeaves(map);
    expect(graph).toBe(map);
    expect(groups.size).toBe(0);
  });

  it("groups each source's exclusive leaves by kind past the threshold", () => {
    expect(big.nodes.length).toBeGreaterThan(180);
    const { graph, groups } = collapseLeaves(big);
    expect(groups.size).toBe(12);
    // 12 agents, 12 aggregates, 12 keys, 1 shared repository.
    expect(graph.nodes).toHaveLength(37);
    const aggregate = graph.nodes.find((n) => n.id === "agg:big_agent_00:resource");
    expect(aggregate).toMatchObject({ label: "14 resources", kind: "resource", attributes: { aggregate: "14" } });
    expect(groups.get("agg:big_agent_00:resource")).toHaveLength(14);
    const edge = graph.edges.find((e) => e.target === "agg:big_agent_00:resource");
    expect(edge).toMatchObject({ source: "big_agent_00", relation: "reads", count: 28 });
    const kept = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) expect(kept.has(e.source) && kept.has(e.target)).toBe(true);
  });

  it("never groups credentials, shared things or anything with a signal", () => {
    const { graph } = collapseLeaves(big);
    expect(graph.nodes.filter((n) => n.kind === "credential")).toHaveLength(12);
    expect(graph.nodes.some((n) => n.id === "big_repo")).toBe(true);
    const flagged: NetworkMap = { ...big, nodes: big.nodes.map((n) => (n.id === "big_agent_00_file_00" ? { ...n, signals: ["privileged_reach"] } : n)) };
    const result = collapseLeaves(flagged);
    expect(result.graph.nodes.some((n) => n.id === "big_agent_00_file_00")).toBe(true);
    expect(result.groups.get("agg:big_agent_00:resource")).toHaveLength(13);
  });

  it("opens a group a person expanded", () => {
    const { graph, groups } = collapseLeaves(big, { expanded: new Set(["agg:big_agent_03:resource"]) });
    expect(groups.has("agg:big_agent_03:resource")).toBe(false);
    expect(graph.nodes.filter((n) => n.id.startsWith("big_agent_03_file_"))).toHaveLength(14);
  });

  it("lays out a collapsed large map in reasonable time", () => {
    const { graph } = collapseLeaves(big);
    const started = performance.now();
    const layout = layoutPicture(graph, indexMap(graph).roles);
    expect(layout.nodes.size).toBe(graph.nodes.length);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("text equivalent", () => {
  it("has a row for every node, with labels from the vocabulary", () => {
    const rows = nodeRows(map);
    expect(rows).toHaveLength(map.nodes.length);
    expect(rows[0]?.kind).toBe("Agent");
    const notes = rows.find((r) => r.id === "ent_mcp_notes");
    expect(notes).toMatchObject({ label: "notes-sync", kind: "MCP server", state: ENTITY_STATE_META.corroborated.label, signals: "Shadow MCP", reporters: 2, firstSeen: "Nov 15, 09:40" });
  });

  it("has a sentence for every edge, with who reported it", () => {
    const rows = edgeRows(map, index);
    expect(rows).toHaveLength(map.edges.length);
    expect(rows[0]).toMatchObject({ sentence: "release-assistant works for Maya Chen", relation: "Works for", reporters: "release-assistant" });
    expect(rows.find((r) => r.sentence === "billing-helper shares a job with web-ci")?.reporters).toBe("release-assistant");
  });

  it("names a node for a screen reader without relying on colour", () => {
    expect(nodeAriaLabel(node("ent_mcp_notes"))).toBe("notes-sync, MCP server, Corroborated, Shadow MCP, seen by 2 sources");
    expect(nodeAriaLabel(node("ent_release"))).toBe("release-assistant, Agent, Source");
  });

  it("subtitles and times read the same on the server and the client", () => {
    expect(nodeSubtitle(node("ent_release"), map.generatedAt)).toBe("Claude Code");
    expect(nodeSubtitle(node("ent_data"), map.generatedAt)).toBe("Cursor · Quiet 26h");
    expect(nodeSubtitle(node("ent_billing"), map.generatedAt)).toBe("Unknown agent");
    expect(nodeSubtitle(node("ent_deploy"), map.generatedAt)).toBe("Mentioned agent");
    expect(nodeSubtitle(node("ent_crm"), map.generatedAt)).toBe("Resource · mentioned");
    expect(formatWhen("2026-11-15T09:31:00.000Z")).toBe("Nov 15, 09:31");
    expect(formatAgo("2026-11-18T09:41:00.000Z", map.generatedAt)).toBe("19m ago");
    expect(formatAgo("2026-11-15T09:41:00.000Z", map.generatedAt)).toBe("3d ago");
  });
});

/**
 * Read models for people: the network map, the sources list, a node's dossier and the debrief log.
 * Agents never call these (`network:read` is people only).
 */
import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

import { ENTITY_STATES, EVENT_KINDS, type EntityState, type EventKind, type SightingBasis } from "@/lib/domain";
import type { MapEdge, MapNode, NetworkMap, SourceProfile } from "@/lib/network-map";
import { deriveSignals } from "@/lib/signals";

import { agents, entities, events, observations } from "../db/schema";
import { inTenant, tenantRow, type Ctx } from "./context";
import { notFound } from "./errors";
import { assertCan } from "./policy";
import { Empty } from "./schemas";
import { service } from "./service";

const iso = (date: Date) => date.toISOString();

/** Strongest first: what a reporter used beats what it saw running, beats a config, beats hearsay. */
const BASIS_STRENGTH: SightingBasis[] = ["accessed", "running", "configured", "mentioned"];

function profileOf(agent: typeof agents.$inferSelect): SourceProfile {
  return {
    agentId: agent.id,
    harness: agent.harness,
    model: agent.model,
    runtime: agent.runtime,
    host: agent.host,
    principalName: agent.principalName,
    task: agent.task,
    firstSeenAt: iso(agent.firstSeenAt),
    lastSeenAt: iso(agent.lastSeenAt),
    checkedOutAt: agent.checkedOutAt ? iso(agent.checkedOutAt) : null,
    reportCount: agent.reportCount,
  };
}

/** Every node and edge in the network, with provenance, signals and source profiles. */
export async function buildNetworkMap(ctx: Ctx, now = new Date()): Promise<NetworkMap> {
  const [entityRows, agentRows, observationRows, [first]] = await Promise.all([
    ctx.db.select().from(entities).where(inTenant(ctx, entities)).orderBy(asc(entities.firstSeenAt)),
    ctx.db.select().from(agents).where(inTenant(ctx, agents)),
    ctx.db.select().from(observations).where(inTenant(ctx, observations)),
    ctx.db.select({ at: events.createdAt }).from(events).where(inTenant(ctx, events)).orderBy(asc(events.createdAt)).limit(1),
  ]);
  const agentByEntity = new Map(agentRows.map((agent) => [agent.entityId, agent]));
  const selfReporter = new Map(agentRows.map((agent) => [agent.entityId, agent.id]));

  const edges = new Map<string, MapEdge>();
  const reporters = new Map<string, Set<string>>();
  for (const row of observationRows) {
    const key = `${row.subjectId}|${row.relation}|${row.objectId}`;
    const edge = edges.get(key);
    if (edge) {
      edge.count += row.count;
      if (!edge.reporterIds.includes(row.reporterAgentId)) edge.reporterIds.push(row.reporterAgentId);
      if (iso(row.firstAt) < edge.firstAt) edge.firstAt = iso(row.firstAt);
      if (iso(row.lastAt) > edge.lastAt) {
        edge.lastAt = iso(row.lastAt);
        edge.recent = [...row.recent, ...edge.recent].slice(0, 3);
      } else edge.recent = [...edge.recent, ...row.recent].slice(0, 3);
    } else {
      edges.set(key, { id: row.id, source: row.subjectId, target: row.objectId, relation: row.relation, count: row.count, reporterIds: [row.reporterAgentId], firstAt: iso(row.firstAt), lastAt: iso(row.lastAt), recent: row.recent.slice(0, 3), bases: [] });
    }
    const edgeNow = edges.get(key)!;
    if (row.basis && !edgeNow.bases.includes(row.basis)) edgeNow.bases = [...edgeNow.bases, row.basis].sort((a, b) => BASIS_STRENGTH.indexOf(a) - BASIS_STRENGTH.indexOf(b));
    if (selfReporter.get(row.objectId) !== row.reporterAgentId) reporters.set(row.objectId, (reporters.get(row.objectId) ?? new Set()).add(row.reporterAgentId));
  }

  const nodes = entityRows.map((row): Omit<MapNode, "signals"> => {
    const agent = agentByEntity.get(row.id);
    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      ref: row.ref,
      state: row.state,
      reporterCount: reporters.get(row.id)?.size ?? 0,
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt),
      attributes: row.attributes,
      source: agent ? profileOf(agent) : null,
    };
  });
  const edgeList = [...edges.values()];
  const signals = deriveSignals(nodes, edgeList, now);
  return {
    nodes: nodes.map((node) => ({ ...node, signals: signals.get(node.id) ?? [] })),
    edges: edgeList,
    generatedAt: iso(now),
    since: first ? iso(first.at) : null,
  };
}

export const getNetworkMap = service(Empty, async (ctx) => {
  assertCan(ctx, "network:read");
  return buildNetworkMap(ctx);
});

export interface Counts {
  sources: number;
  leads: number;
  corroborated: number;
  references: number;
  /** Everything in the picture except references (heard of, not seen) and dismissed nodes. */
  mapped: number;
}

export function countsOf(map: Pick<NetworkMap, "nodes">): Counts {
  const by = (state: EntityState) => map.nodes.filter((node) => node.state === state).length;
  return {
    sources: by("source"),
    leads: by("lead"),
    corroborated: by("corroborated"),
    references: by("reference"),
    mapped: map.nodes.filter((node) => node.state !== "reference" && node.state !== "dismissed").length,
  };
}

export interface EventView {
  id: number;
  kind: EventKind;
  actorType: "user" | "agent" | "system";
  actorName: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
}

export const ListEventsInput = z.object({
  entityId: z.string().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export const listEvents = service(ListEventsInput, async (ctx, input): Promise<EventView[]> => {
  assertCan(ctx, "network:read");
  return ctx.db
    .select({ id: events.id, kind: events.kind, actorType: events.actorType, actorName: events.actorName, entityId: events.entityId, summary: events.summary, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        inTenant(ctx, events),
        input.entityId ? eq(events.entityId, input.entityId) : undefined,
        input.kind ? eq(events.kind, input.kind) : undefined,
        input.before ? lt(events.id, input.before) : undefined,
      ),
    )
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(input.limit);
});

export interface DossierEdge {
  id: string;
  direction: "out" | "in";
  relation: MapEdge["relation"];
  other: { id: string; label: string; kind: MapNode["kind"]; state: EntityState };
  reporterName: string;
  basis: string | null;
  count: number;
  firstAt: Date;
  lastAt: Date;
  recent: string[];
}

export interface Dossier {
  node: MapNode;
  edges: DossierEdge[];
  events: EventView[];
  /** The person's call on a traced or dismissed node (or the last one undone by a reopen); null when nobody decided. */
  decision: { byName: string | null; at: Date | null; note: string | null } | null;
  /** For a source: the session it last reported from, as it gave it (a session id or resume URL). */
  sessionRef: string | null;
}

export const getDossier = service(z.object({ entityId: z.string().min(1) }), async (ctx, input): Promise<Dossier> => {
  assertCan(ctx, "network:read");
  const map = await buildNetworkMap(ctx);
  const node = map.nodes.find((candidate) => candidate.id === input.entityId);
  if (!node) throw notFound("node", input.entityId);
  const [rows, agentRows, log, entity] = await Promise.all([
    ctx.db
      .select()
      .from(observations)
      .where(and(inTenant(ctx, observations), or(eq(observations.subjectId, node.id), eq(observations.objectId, node.id))))
      .orderBy(desc(observations.lastAt)),
    ctx.db.select({ id: agents.id, name: agents.name, sessionRef: agents.sessionRef }).from(agents).where(inTenant(ctx, agents)),
    listEvents(ctx, { entityId: node.id, limit: 50 }),
    findEntity(ctx, node.id),
  ]);
  const names = new Map(agentRows.map((agent) => [agent.id, agent.name]));
  const byId = new Map(map.nodes.map((candidate) => [candidate.id, candidate]));
  const edges = rows.flatMap((row): DossierEdge[] => {
    const direction = row.subjectId === node.id ? "out" : "in";
    const other = byId.get(direction === "out" ? row.objectId : row.subjectId);
    if (!other) return [];
    return [
      {
        id: row.id,
        direction,
        relation: row.relation,
        other: { id: other.id, label: other.label, kind: other.kind, state: other.state },
        reporterName: names.get(row.reporterAgentId) ?? "an agent",
        basis: row.basis,
        count: row.count,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
        recent: row.recent,
      },
    ];
  });
  const decision = entity && (entity.stateChangedByName || entity.note) ? { byName: entity.stateChangedByName, at: entity.stateChangedAt, note: entity.note } : null;
  const sessionRef = (node.source && agentRows.find((agent) => agent.id === node.source?.agentId)?.sessionRef) ?? null;
  return { node, edges, events: log, decision, sessionRef };
});

export interface SourceRow {
  agentId: string;
  entityId: string;
  name: string;
  harness: string;
  model: string | null;
  runtime: string;
  host: string | null;
  principalName: string | null;
  task: string | null;
  reportCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  checkedOutAt: Date | null;
}

export const listSources = service(Empty, async (ctx): Promise<SourceRow[]> => {
  assertCan(ctx, "network:read");
  const rows = await ctx.db.select().from(agents).where(inTenant(ctx, agents)).orderBy(desc(agents.lastSeenAt));
  return rows.map((agent) => ({
    agentId: agent.id,
    entityId: agent.entityId,
    name: agent.name,
    harness: agent.harness,
    model: agent.model,
    runtime: agent.runtime,
    host: agent.host,
    principalName: agent.principalName,
    task: agent.task,
    reportCount: agent.reportCount,
    firstSeenAt: agent.firstSeenAt,
    lastSeenAt: agent.lastSeenAt,
    checkedOutAt: agent.checkedOutAt,
  }));
});

export function isEntityState(value: unknown): value is EntityState {
  return typeof value === "string" && (ENTITY_STATES as readonly string[]).includes(value);
}

/** The entity row, scoped to the tenant (for decisions). */
export async function findEntity(ctx: Ctx, id: string) {
  const [row] = await ctx.db.select().from(entities).where(tenantRow(ctx, entities, id));
  return row ?? null;
}

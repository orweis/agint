/**
 * Writes to the map: nodes (`entities`), edges with provenance (`observations`), the debrief log
 * (`events`), and the lead lifecycle. Only `intake.ts` and `entities.ts` call these, inside a transaction.
 */
import { and, countDistinct, eq, inArray, ne, or, sql } from "drizzle-orm";

import { HUMAN_STATES, LIMITS, type EntityKind, type EntityState, type EventKind, type Relation, type SightingBasis } from "@/lib/domain";
import { labelOf, refOf, type TargetInput } from "@/lib/refs";

import { newId } from "../db/ids";
import { agents, entities, events, observations } from "../db/schema";
import { inTenant, tenantRow, type Ctx } from "./context";

export type EntityRow = typeof entities.$inferSelect;

const isHumanState = (state: EntityState) => (HUMAN_STATES as readonly string[]).includes(state);

export interface UpsertOptions {
  /** The state a new node starts in. */
  state: EntityState;
  at: Date;
  attributes?: Record<string, string>;
}

/** The node for a target, created if new. A reference that is now actually seen becomes a lead. */
export async function upsertEntity(ctx: Ctx, target: TargetInput, options: UpsertOptions): Promise<EntityRow> {
  const ref = refOf(target);
  const attributes = Object.fromEntries(Object.entries(options.attributes ?? {}).filter(([, value]) => value));
  const [existing] = await ctx.db
    .select()
    .from(entities)
    .where(and(inTenant(ctx, entities), eq(entities.kind, target.kind), eq(entities.ref, ref)));
  if (!existing) {
    const [row] = await ctx.db
      .insert(entities)
      .values({ id: newId("e"), tenantId: ctx.tenant.id, kind: target.kind, ref, label: labelOf(target), state: options.state, attributes, firstSeenAt: options.at, lastSeenAt: options.at })
      .returning();
    return row!;
  }
  const state: EntityState = existing.state === "reference" && options.state === "lead" ? "lead" : existing.state;
  const [row] = await ctx.db
    .update(entities)
    .set({
      state,
      attributes: { ...existing.attributes, ...attributes },
      lastSeenAt: options.at > existing.lastSeenAt ? options.at : existing.lastSeenAt,
      firstSeenAt: options.at < existing.firstSeenAt ? options.at : existing.firstSeenAt,
    })
    .where(tenantRow(ctx, entities, existing.id))
    .returning();
  return row!;
}

export interface EdgeInput {
  reporterAgentId: string;
  subjectId: string;
  relation: Relation;
  objectId: string;
  basis?: SightingBasis | null;
  summary?: string | undefined;
  at: Date;
}

/** Records one report of an edge; a repeat counts up rather than adding a row. */
export async function observe(ctx: Ctx, edge: EdgeInput): Promise<void> {
  const recent = edge.summary ? [edge.summary.slice(0, LIMITS.summary)] : [];
  await ctx.db
    .insert(observations)
    .values({
      id: newId("o"),
      tenantId: ctx.tenant.id,
      reporterAgentId: edge.reporterAgentId,
      subjectId: edge.subjectId,
      relation: edge.relation,
      objectId: edge.objectId,
      basis: edge.basis ?? null,
      recent,
      firstAt: edge.at,
      lastAt: edge.at,
    })
    .onConflictDoUpdate({
      target: [observations.tenantId, observations.reporterAgentId, observations.subjectId, observations.relation, observations.objectId],
      set: {
        count: sql`${observations.count} + 1`,
        lastAt: sql`greatest(${observations.lastAt}, excluded.last_at)`,
        firstAt: sql`least(${observations.firstAt}, excluded.first_at)`,
        // A stronger basis (seen) replaces "mentioned"; "mentioned" never weakens one.
        basis: sql`case when excluded.basis is null or excluded.basis = 'mentioned' then coalesce(${observations.basis}, excluded.basis) else excluded.basis end`,
        recent: recent.length ? sql`jsonb_path_query_array(jsonb_build_array(${recent[0]}::text) || ${observations.recent}, '$[0 to 2]')` : sql`${observations.recent}`,
      },
    });
}

export async function logEvent(ctx: Ctx, kind: EventKind, summary: string, options: { entityId?: string | null; data?: Record<string, unknown>; at?: Date } = {}): Promise<void> {
  const actor = ctx.actor;
  await ctx.db.insert(events).values({
    tenantId: ctx.tenant.id,
    kind,
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    entityId: options.entityId ?? null,
    summary: summary.slice(0, LIMITS.summary),
    data: options.data ?? {},
    ...(options.at && { createdAt: options.at }),
  });
}

/**
 * Re-grades a node from its reports: seen by two or more independent sources is corroborated, by one
 * a lead, and only ever mentioned a reference. A person's call (traced, dismissed) and a source stand.
 * Returns the new state when it changed.
 */
export async function regrade(ctx: Ctx, entityId: string, at: Date): Promise<EntityState | null> {
  const [entity] = await ctx.db.select().from(entities).where(tenantRow(ctx, entities, entityId));
  if (!entity || entity.state === "source" || isHumanState(entity.state)) return null;
  // The node's own agent (when it is a source that reports about itself) is not independent.
  const self = await ctx.db.select({ id: agents.id }).from(agents).where(and(inTenant(ctx, agents), eq(agents.entityId, entityId)));
  const reporters = (basisFilter: "seen" | "any") =>
    ctx.db
      .select({ n: countDistinct(observations.reporterAgentId) })
      .from(observations)
      .where(
        and(
          inTenant(ctx, observations),
          eq(observations.objectId, entityId),
          basisFilter === "seen" ? or(sql`${observations.basis} is null`, ne(observations.basis, "mentioned")) : undefined,
          self.length ? sql`${observations.reporterAgentId} not in ${self.map((row) => row.id)}` : undefined,
        ),
      );
  const [seen] = await reporters("seen");
  const n = seen?.n ?? 0;
  const next: EntityState = n >= 2 ? "corroborated" : n === 1 ? "lead" : "reference";
  if (next === entity.state) return null;
  await ctx.db.update(entities).set({ state: next }).where(tenantRow(ctx, entities, entityId));
  if (next === "corroborated") await logEvent(ctx, "corroborated", `${entity.label} was corroborated: seen by ${n} independent sources.`, { entityId, at });
  return next;
}

/**
 * Folds `duplicate` into `keep`: its edges move over (merging with any the keeper already has) and it
 * is deleted. Used when a lead turns out to be an agent that has just connected.
 */
export async function mergeEntity(ctx: Ctx, keep: string, duplicate: string): Promise<void> {
  const rows = await ctx.db
    .select()
    .from(observations)
    .where(and(inTenant(ctx, observations), or(eq(observations.subjectId, duplicate), eq(observations.objectId, duplicate))));
  for (const row of rows) {
    const subjectId = row.subjectId === duplicate ? keep : row.subjectId;
    const objectId = row.objectId === duplicate ? keep : row.objectId;
    if (subjectId === objectId) continue;
    for (let i = 0; i < row.count; i++) {
      await observe(ctx, { reporterAgentId: row.reporterAgentId, subjectId, relation: row.relation, objectId, basis: row.basis, summary: i === 0 ? row.recent[0] : undefined, at: i === 0 ? row.firstAt : row.lastAt });
    }
  }
  await ctx.db.update(events).set({ entityId: keep }).where(and(inTenant(ctx, events), eq(events.entityId, duplicate)));
  await ctx.db.delete(entities).where(tenantRow(ctx, entities, duplicate));
}

export async function entitiesByIds(ctx: Ctx, ids: string[]): Promise<EntityRow[]> {
  if (!ids.length) return [];
  return ctx.db.select().from(entities).where(and(inTenant(ctx, entities), inArray(entities.id, ids)));
}

export type { EntityKind };

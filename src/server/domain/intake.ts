/**
 * What agents call: check in, debrief activity, report sightings, change task, check out.
 * Every string passes through `withhold` first, so a secret an agent forgets to leave out is never
 * stored. Agents can only add reports; they cannot read the map or grade anything.
 */
import { createHash } from "node:crypto";

import { and, countDistinct, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { relationOfAction, type EntityKind, type Relation, type SightingBasis } from "@/lib/domain";
import { withhold } from "@/lib/redact";
import { agentRef, type TargetInput } from "@/lib/refs";

import { newId } from "../db/ids";
import { agents, entities, observations } from "../db/schema";
import { inTenant, inTransaction, tenantRow, type Ctx } from "./context";
import { forbidden, invalid, notFound } from "./errors";
import { logEvent, mergeEntity, observe, regrade, upsertEntity } from "./graph";
import { assertCan } from "./policy";
import { AutoReportInput, CheckInInput, CheckOutInput, ReportActivityInput, ReportSightingsInput, SetTaskInput, type TargetIn } from "./schemas";
import { service } from "./service";

const MAX_AGE_MS = 7 * 24 * 3_600_000;

/** A report's time: now, or when it says it happened if that was within the last week. */
function when(at: string | undefined, now = new Date()): Date {
  if (!at) return now;
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || date > now) return now;
  if (now.getTime() - date.getTime() > MAX_AGE_MS) throw invalid("Reports may be at most 7 days old.");
  return date;
}

function agentKey(ctx: Ctx): string {
  if (ctx.actor.type !== "agent") throw forbidden("Only connected agents report to AGINT.");
  return ctx.actor.keyId;
}

type AgentRow = typeof agents.$inferSelect;

/** The source an agentId names, if it checked in through this caller's key. */
async function sourceOf(ctx: Ctx, agentId: string): Promise<AgentRow> {
  const keyId = agentKey(ctx);
  const [agent] = await ctx.db.select().from(agents).where(tenantRow(ctx, agents, agentId));
  // Another key's agent reads as missing, so ids cannot be probed across keys.
  if (!agent || agent.keyId !== keyId) throw notFound("agent", agentId);
  return agent;
}

/** The context for the rest of a report: the source itself is the actor, so the log names it. */
function asSource(ctx: Ctx, agent: AgentRow): Ctx {
  return { ...ctx, actor: { type: "agent", id: agent.id, name: agent.name, role: "agent", keyId: agent.keyId } };
}

function attributesOf(target: TargetIn): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ location: target.location, url: target.url, harness: target.harness, host: target.host }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

async function touch(ctx: Ctx, agent: AgentRow, at: Date, reports: number): Promise<void> {
  await ctx.db
    .update(agents)
    .set({ lastSeenAt: sql`greatest(${agents.lastSeenAt}, ${at.toISOString()}::timestamptz)`, reportCount: sql`${agents.reportCount} + ${reports}`, checkedOutAt: null })
    .where(tenantRow(ctx, agents, agent.id));
  await ctx.db.update(entities).set({ lastSeenAt: sql`greatest(${entities.lastSeenAt}, ${at.toISOString()}::timestamptz)` }).where(tenantRow(ctx, entities, agent.entityId));
}

interface Link {
  target: TargetInput & { url?: string | undefined };
  relation: Relation;
  basis?: SightingBasis | null;
  summary?: string | undefined;
}

/** Records edges from a source to targets, then re-grades what they point at. */
async function link(ctx: Ctx, agent: AgentRow, links: Link[], at: Date): Promise<string[]> {
  const touched = new Set<string>();
  for (const item of links) {
    // A target naming the reporter itself is not an edge.
    const state = item.basis === "mentioned" ? "reference" : "lead";
    const entity = await upsertEntity(ctx, item.target, { state, at, attributes: attributesOf(item.target as TargetIn) });
    if (entity.id === agent.entityId) continue;
    await observe(ctx, { reporterAgentId: agent.id, subjectId: agent.entityId, relation: item.relation, objectId: entity.id, basis: item.basis ?? null, summary: item.summary, at });
    touched.add(entity.id);
  }
  for (const id of touched) await regrade(ctx, id, at);
  return [...touched];
}

export interface CheckInResult {
  agentId: string;
  status: "new" | "returning";
  /** When AGINT already had this agent as a lead from someone else's report, and it has now connected. */
  connectedLead: { label: string; reportedBy: number } | null;
  withheld: number;
}

/**
 * Enrols (or welcomes back) an agent as a source. The same name, harness and host through the same
 * key is the same source. If others reported this agent as a lead, the lead becomes this source and
 * keeps everything that was said about it.
 */
export const checkIn = service(CheckInInput, async (ctx, raw): Promise<CheckInResult> => {
  assertCan(ctx, "network:report");
  const keyId = agentKey(ctx);
  const { value: input, count: withheld } = withhold(raw);
  const now = when(input.at);
  const fingerprint = createHash("sha256")
    .update([keyId, input.name, input.harness, input.host ?? ""].map((part) => part.trim().toLowerCase()).join("\u0000"))
    .digest("hex");

  return inTransaction(ctx, async (tx) => {
    const fields = {
      name: input.name,
      harness: input.harness.toLowerCase(),
      model: input.model ?? null,
      runtime: input.runtime,
      host: input.host ?? null,
      principalName: input.principal?.name ?? null,
      principalEmail: input.principal?.email ?? null,
      task: input.task ?? null,
      sessionRef: input.sessionRef ?? null,
    };
    const [existing] = await tx.db.select().from(agents).where(and(inTenant(tx, agents), eq(agents.fingerprint, fingerprint)));
    let agent: AgentRow;
    let connectedLead: CheckInResult["connectedLead"] = null;
    if (existing) {
      [agent] = (await tx.db.update(agents).set({ ...fields, lastSeenAt: sql`greatest(${agents.lastSeenAt}, ${now.toISOString()}::timestamptz)`, checkedOutAt: null }).where(tenantRow(tx, agents, existing.id)).returning()) as [AgentRow];
    } else {
      // Was this agent a lead in someone else's picture? By name, or by harness on the same host.
      const refs = [agentRef({ name: input.name }), ...(input.host ? [agentRef({ harness: input.harness, host: input.host })] : [])];
      const leads = await tx.db
        .select()
        .from(entities)
        .where(
          and(
            inTenant(tx, entities),
            eq(entities.kind, "agent"),
            ne(entities.state, "source"),
            or(
              inArray(entities.ref, refs),
              input.host ? and(sql`lower(${entities.attributes}->>'harness') = ${fields.harness}`, sql`lower(${entities.attributes}->>'host') = ${input.host.toLowerCase()}`) : undefined,
            ),
          ),
        );
      const rank = (ref: string) => (refs.includes(ref) ? refs.indexOf(ref) : refs.length);
      leads.sort((a, b) => rank(a.ref) - rank(b.ref));
      const [lead, ...duplicates] = leads;
      let entityId: string;
      if (lead) {
        for (const duplicate of duplicates) await mergeEntity(tx, lead.id, duplicate.id);
        await tx.db
          .update(entities)
          .set({ state: "source", ref: refs[0]!, label: input.name, attributes: { ...lead.attributes, harness: fields.harness, ...(input.host && { host: input.host }) }, lastSeenAt: now })
          .where(tenantRow(tx, entities, lead.id));
        entityId = lead.id;
      } else {
        const entity = await upsertEntity(tx, { kind: "agent", name: input.name }, { state: "source", at: now, attributes: { harness: fields.harness, ...(input.host && { host: input.host }) } });
        if (entity.state !== "source") await tx.db.update(entities).set({ state: "source" }).where(tenantRow(tx, entities, entity.id));
        entityId = entity.id;
      }
      [agent] = (await tx.db.insert(agents).values({ id: newId("ag"), tenantId: tx.tenant.id, entityId, keyId, fingerprint, ...fields, firstSeenAt: now, lastSeenAt: now }).returning()) as [AgentRow];
      if (lead) {
        const [reporters] = await tx.db.select({ n: countDistinct(observations.reporterAgentId) }).from(observations).where(and(inTenant(tx, observations), eq(observations.objectId, entityId)));
        connectedLead = { label: lead.label, reportedBy: reporters?.n ?? 0 };
      }
    }

    const source = asSource(tx, agent);
    await logEvent(source, "check_in", connectedLead ? `${agent.name} connected. It was a lead; now it reports its own view.` : `${agent.name} checked in${fields.principalName ? ` for ${fields.principalName}` : ""}.`, {
      entityId: agent.entityId,
      data: { harness: fields.harness, runtime: fields.runtime, host: fields.host, task: fields.task, withheld },
      at: now,
    });
    if (connectedLead) await logEvent(source, "lead_connected", `Lead “${connectedLead.label}” connected as source ${agent.name}.`, { entityId: agent.entityId, at: now });

    const links: Link[] = [];
    if (input.principal?.name || input.principal?.email) links.push({ target: { kind: "person", name: input.principal.email ?? input.principal.name! }, relation: "works_for" });
    if (input.host) links.push({ target: { kind: "host", name: input.host }, relation: "runs_on" });
    for (const tool of input.tools) links.push({ target: { kind: "tool", name: tool }, relation: "uses" });
    for (const server of input.mcpServers) links.push({ target: { kind: "mcp_server", name: server.name, url: server.url }, relation: "uses", basis: "configured" });
    for (const repository of input.repositories) links.push({ target: { kind: "repository", name: repository }, relation: "reads" });
    for (const credential of input.credentials) links.push({ target: { kind: "credential", name: credential.name, location: credential.location, fingerprint: credential.fingerprint }, relation: "holds" });
    await link(source, agent, links, now);
    // A person entity takes the principal's display name when it was keyed by email.
    if (input.principal?.email && input.principal.name) {
      await tx.db.update(entities).set({ label: input.principal.name }).where(and(inTenant(tx, entities), eq(entities.kind, "person"), eq(entities.ref, input.principal.email.toLowerCase())));
    }
    await touch(tx, agent, now, 1);
    return { agentId: agent.id, status: existing ? "returning" : "new", connectedLead, withheld };
  });
});

export interface ReportResult {
  recorded: number;
  withheld: number;
}

export const reportActivity = service(ReportActivityInput, async (ctx, raw): Promise<ReportResult> => {
  assertCan(ctx, "network:report");
  const { value: input, count: withheld } = withhold(raw);
  return inTransaction(ctx, async (tx) => {
    const agent = await sourceOf(tx, input.agentId);
    const source = asSource(tx, agent);
    let latest = new Date(0);
    for (const activity of input.activities) {
      const at = when(activity.at);
      if (at > latest) latest = at;
      const touched = await link(
        source,
        agent,
        activity.targets.map((target) => ({ target, relation: relationOfAction(activity.action, target.kind), summary: activity.summary })),
        at,
      );
      const names = activity.targets.map((target) => target.name).join(", ");
      await logEvent(source, "activity", activity.summary ?? `${activity.action} ${names}`, { entityId: touched[0] ?? null, data: { action: activity.action, targets: activity.targets.map((t) => ({ kind: t.kind, name: t.name })), entityIds: touched }, at });
    }
    await touch(tx, agent, latest, input.activities.length);
    return { recorded: input.activities.length, withheld };
  });
});

export interface SightingsResult extends ReportResult {
  /** What each sighting is now in AGINT's picture: still a lead, already corroborated, or a known source. */
  leads: { name: string; kind: EntityKind; state: string }[];
}

export const reportSightings = service(ReportSightingsInput, async (ctx, raw): Promise<SightingsResult> => {
  assertCan(ctx, "network:report");
  const { value: input, count: withheld } = withhold(raw);
  return inTransaction(ctx, async (tx) => {
    const agent = await sourceOf(tx, input.agentId);
    const source = asSource(tx, agent);
    const leads: SightingsResult["leads"] = [];
    let latest = new Date(0);
    for (const sighting of input.sightings) {
      const at = when(sighting.at);
      if (at > latest) latest = at;
      // An agent seen on "this machine" without a host of its own is on the reporter's host.
      const onThisMachine = sighting.target.kind === "agent" && !sighting.target.host && agent.host && sighting.basis !== "mentioned";
      const target = onThisMachine ? { ...sighting.target, host: agent.host! } : sighting.target;
      const relation: Relation = sighting.sharesJob ? "shares_job" : "sees";
      const [id] = await link(source, agent, [{ target, relation, basis: sighting.basis, summary: sighting.note }], at);
      const [entity] = id ? await tx.db.select().from(entities).where(tenantRow(tx, entities, id)) : [];
      if (entity) {
        leads.push({ name: entity.label, kind: entity.kind, state: entity.state });
        await logEvent(source, "sighting", `${agent.name} ${sighting.basis === "mentioned" ? "heard of" : "saw"} ${entity.label}${sighting.note ? `: ${sighting.note}` : ""}`, {
          entityId: entity.id,
          data: { kind: entity.kind, basis: sighting.basis, sharesJob: sighting.sharesJob },
          at,
        });
      }
    }
    await touch(tx, agent, latest, input.sightings.length);
    return { recorded: input.sightings.length, withheld, leads };
  });
});

export const setTask = service(SetTaskInput, async (ctx, raw): Promise<{ agentId: string; task: string }> => {
  assertCan(ctx, "network:report");
  const { value: input } = withhold(raw);
  return inTransaction(ctx, async (tx) => {
    const agent = await sourceOf(tx, input.agentId);
    const source = asSource(tx, agent);
    const now = new Date();
    await tx.db
      .update(agents)
      .set({ task: input.task, ...(input.principal?.name !== undefined && { principalName: input.principal.name }), ...(input.principal?.email !== undefined && { principalEmail: input.principal.email }) })
      .where(tenantRow(tx, agents, agent.id));
    if (input.principal?.name || input.principal?.email) await link(source, agent, [{ target: { kind: "person", name: input.principal.email ?? input.principal.name! }, relation: "works_for" }], now);
    await logEvent(source, "task", `${agent.name} changed task: ${input.task}`, { entityId: agent.entityId, data: { previous: agent.task }, at: now });
    await touch(tx, agent, now, 1);
    return { agentId: agent.id, task: input.task };
  });
});

export const checkOut = service(CheckOutInput, async (ctx, raw): Promise<{ agentId: string; checkedOut: true }> => {
  assertCan(ctx, "network:report");
  const { value: input } = withhold(raw);
  return inTransaction(ctx, async (tx) => {
    const agent = await sourceOf(tx, input.agentId);
    const now = new Date();
    await touch(tx, agent, now, 1);
    await tx.db.update(agents).set({ checkedOutAt: now }).where(tenantRow(tx, agents, agent.id));
    await logEvent(asSource(tx, agent), "check_out", input.summary ? `${agent.name} checked out: ${input.summary}` : `${agent.name} checked out.`, { entityId: agent.entityId, at: now });
    return { agentId: agent.id, checkedOut: true };
  });
});

export type CheckIn = z.input<typeof CheckInInput>;

/**
 * For hooks and SDKs that report on an agent's behalf (e.g. a Claude Code PostToolUse hook): check in,
 * then debrief and sight in one call. Checking in again is idempotent, so every call can carry it.
 */
export const autoReport = service(AutoReportInput, async (ctx, input) => {
  const checkedIn = await checkIn(ctx, input.checkIn);
  const activity = input.activities.length ? await reportActivity(ctx, { agentId: checkedIn.agentId, activities: input.activities }) : null;
  const sightings = input.sightings.length ? await reportSightings(ctx, { agentId: checkedIn.agentId, sightings: input.sightings }) : null;
  if (input.checkOut) await checkOut(ctx, { agentId: checkedIn.agentId });
  return {
    agentId: checkedIn.agentId,
    activities: activity?.recorded ?? 0,
    sightings: sightings?.recorded ?? 0,
    withheld: checkedIn.withheld + (activity?.withheld ?? 0) + (sightings?.withheld ?? 0),
  };
});

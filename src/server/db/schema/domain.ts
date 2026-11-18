import {
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ENTITY_KINDS, ENTITY_STATES, EVENT_KINDS, RELATIONS, RUNTIMES, SIGHTING_BASES } from "../../../lib/domain";

import { organization, user } from "./auth";

export const entityKindEnum = pgEnum("entity_kind", ENTITY_KINDS);
export const entityStateEnum = pgEnum("entity_state", ENTITY_STATES);
export const relationEnum = pgEnum("relation", RELATIONS);
export const runtimeEnum = pgEnum("runtime", RUNTIMES);
export const basisEnum = pgEnum("sighting_basis", SIGHTING_BASES);
export const eventKindEnum = pgEnum("event_kind", EVENT_KINDS);
export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system"]);

const timestampTz = (name: string) => timestamp(name, { withTimezone: true });

const tenantId = () =>
  text("tenant_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/**
 * Intake keys: what a person hands to agents so they can connect. One key may serve many agents
 * (a team's key); each agent then identifies itself with `check_in`. Stored as a SHA-256 hash.
 */
export const intakeKeys = pgTable(
  "intake_keys",
  {
    id: text("id").primaryKey(),
    tenantId: tenantId(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByName: text("created_by_name").notNull(),
    createdAt: timestampTz("created_at").notNull().defaultNow(),
    lastUsedAt: timestampTz("last_used_at"),
    revokedAt: timestampTz("revoked_at"),
  },
  (t) => [unique("intake_keys_tenant_id_uq").on(t.tenantId, t.id), index("intake_keys_tenant_idx").on(t.tenantId)],
);

/**
 * Everything on the map: agents (enrolled or only seen), people, hosts, tools, MCP servers,
 * credentials (by existence, never by value), repositories, services, data stores, resources and jobs.
 * `ref` is the normalized identity within a kind (`lib/refs.ts`), so two reporters naming the same
 * thing land on one node.
 */
export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    tenantId: tenantId(),
    kind: entityKindEnum("kind").notNull(),
    ref: text("ref").notNull(),
    label: text("label").notNull(),
    state: entityStateEnum("state").notNull(),
    /** Small kind-specific facts as reported (a key's location, a server's url, an unknown agent's harness). */
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    /** A person's note when tracing or dismissing. */
    note: text("note"),
    stateChangedByName: text("state_changed_by_name"),
    stateChangedAt: timestampTz("state_changed_at"),
    firstSeenAt: timestampTz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestampTz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    unique("entities_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("entities_tenant_kind_ref_uq").on(t.tenantId, t.kind, t.ref),
    index("entities_tenant_state_idx").on(t.tenantId, t.state),
  ],
);

/**
 * Sources: agents that connected and report for themselves. Each has its own node in `entities`
 * (`entity_id`, kind `agent`, state `source`). `fingerprint` makes `check_in` idempotent: the same
 * agent on the same host, through the same key, comes back as the same source.
 */
export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    tenantId: tenantId(),
    entityId: text("entity_id").notNull(),
    keyId: text("key_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    name: text("name").notNull(),
    harness: text("harness").notNull(),
    model: text("model"),
    runtime: runtimeEnum("runtime").notNull().default("unknown"),
    host: text("host"),
    principalName: text("principal_name"),
    principalEmail: text("principal_email"),
    task: text("task"),
    sessionRef: text("session_ref"),
    reportCount: integer("report_count").notNull().default(0),
    firstSeenAt: timestampTz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestampTz("last_seen_at").notNull().defaultNow(),
    checkedOutAt: timestampTz("checked_out_at"),
  },
  (t) => [
    unique("agents_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("agents_tenant_fingerprint_uq").on(t.tenantId, t.fingerprint),
    foreignKey({ name: "agents_entity_fk", columns: [t.tenantId, t.entityId], foreignColumns: [entities.tenantId, entities.id] }).onDelete("cascade"),
    foreignKey({ name: "agents_key_fk", columns: [t.tenantId, t.keyId], foreignColumns: [intakeKeys.tenantId, intakeKeys.id] }),
  ],
);

/**
 * Edges with provenance: one row per (reporter, subject, relation, object), counted up as reports
 * repeat, so the map stays bounded however chatty an agent is. An edge seen by two reporters is two rows.
 */
export const observations = pgTable(
  "observations",
  {
    id: text("id").primaryKey(),
    tenantId: tenantId(),
    reporterAgentId: text("reporter_agent_id").notNull(),
    subjectId: text("subject_id").notNull(),
    relation: relationEnum("relation").notNull(),
    objectId: text("object_id").notNull(),
    /** For a sighting: running, configured, accessed or mentioned. Null for the agent's own activity. */
    basis: basisEnum("basis"),
    count: integer("count").notNull().default(1),
    /** Latest summaries, newest first, at most 3. */
    recent: jsonb("recent").$type<string[]>().notNull().default([]),
    firstAt: timestampTz("first_at").notNull().defaultNow(),
    lastAt: timestampTz("last_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("observations_edge_uq").on(t.tenantId, t.reporterAgentId, t.subjectId, t.relation, t.objectId),
    index("observations_tenant_object_idx").on(t.tenantId, t.objectId),
    index("observations_tenant_subject_idx").on(t.tenantId, t.subjectId),
    foreignKey({ name: "observations_reporter_fk", columns: [t.tenantId, t.reporterAgentId], foreignColumns: [agents.tenantId, agents.id] }).onDelete("cascade"),
    foreignKey({ name: "observations_subject_fk", columns: [t.tenantId, t.subjectId], foreignColumns: [entities.tenantId, entities.id] }).onDelete("cascade"),
    foreignKey({ name: "observations_object_fk", columns: [t.tenantId, t.objectId], foreignColumns: [entities.tenantId, entities.id] }).onDelete("cascade"),
  ],
);

/** The debrief log: every report and every decision a person made, append-only. */
export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: tenantId(),
    kind: eventKindEnum("kind").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    /** The node the event is about, when there is one. */
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestampTz("created_at").notNull().defaultNow(),
  },
  (t) => [index("events_tenant_created_idx").on(t.tenantId, t.createdAt.desc()), index("events_tenant_entity_idx").on(t.tenantId, t.entityId)],
);

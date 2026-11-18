import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { INTAKE_KEY_PREFIX } from "@/lib/domain";

import type { Db } from "../db/client";
import { newId } from "../db/ids";
import { agents, intakeKeys, organization } from "../db/schema";
import { inTenant, inTransaction, tenantRow, type Ctx, type Tenant } from "./context";
import { notFound } from "./errors";
import { logEvent } from "./graph";
import { assertCan } from "./policy";
import { Empty, IssueKeyInput, RevokeKeyInput } from "./schemas";
import { service } from "./service";
import { count, sql } from "drizzle-orm";

export function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IntakePrincipal {
  tenant: Tenant;
  keyId: string;
  label: string;
}

/** A live intake key's network, or null. Only the hash is stored; the token itself is shown once. */
export async function authenticateIntakeKey(db: Db, token: string): Promise<IntakePrincipal | null> {
  if (!token.startsWith(INTAKE_KEY_PREFIX)) return null;
  const [row] = await db
    .select({ keyId: intakeKeys.id, label: intakeKeys.label, lastUsedAt: intakeKeys.lastUsedAt, tenant: { id: organization.id, slug: organization.slug, name: organization.name } })
    .from(intakeKeys)
    .innerJoin(organization, eq(organization.id, intakeKeys.tenantId))
    .where(and(eq(intakeKeys.tokenHash, hashKey(token)), isNull(intakeKeys.revokedAt)));
  if (!row) return null;
  // Written at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.update(intakeKeys).set({ lastUsedAt: new Date() }).where(eq(intakeKeys.id, row.keyId));
  return { tenant: row.tenant, keyId: row.keyId, label: row.label };
}

/** The context an intake key acts in. Every tool after check_in names the source with its agentId. */
export function intakeContext(db: Db, principal: IntakePrincipal): Ctx {
  return { db, tenant: principal.tenant, actor: { type: "agent", id: principal.keyId, name: `key “${principal.label}”`, role: "agent", keyId: principal.keyId } };
}

export const issueKey = service(IssueKeyInput, async (ctx, input) => {
  assertCan(ctx, "key:manage");
  const token = `${INTAKE_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return inTransaction(ctx, async (tx) => {
    const id = newId("k");
    await tx.db.insert(intakeKeys).values({
      id,
      tenantId: tx.tenant.id,
      label: input.label,
      tokenHash: hashKey(token),
      tokenPrefix: token.slice(0, INTAKE_KEY_PREFIX.length + 6),
      createdByUserId: tx.actor.type === "user" ? tx.actor.id : null,
      createdByName: tx.actor.name,
    });
    await logEvent(tx, "key_issued", `${tx.actor.name} issued intake key “${input.label}”.`);
    return { keyId: id, token, label: input.label };
  });
});

export const revokeKey = service(RevokeKeyInput, async (ctx, input) => {
  assertCan(ctx, "key:manage");
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db.update(intakeKeys).set({ revokedAt: new Date() }).where(and(tenantRow(tx, intakeKeys, input.keyId), isNull(intakeKeys.revokedAt))).returning();
    if (!row) throw notFound("live intake key", input.keyId);
    await logEvent(tx, "key_revoked", `${tx.actor.name} revoked intake key “${row.label}”. Agents using it can no longer report.`);
    return { keyId: row.id, label: row.label };
  });
});

export interface KeyView {
  id: string;
  label: string;
  tokenPrefix: string;
  createdByName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  sources: number;
}

export const listKeys = service(Empty, async (ctx): Promise<KeyView[]> => {
  assertCan(ctx, "network:read");
  const used = ctx.db.select({ keyId: agents.keyId, n: count().as("n") }).from(agents).where(inTenant(ctx, agents)).groupBy(agents.keyId).as("used");
  const rows = await ctx.db
    .select({
      id: intakeKeys.id,
      label: intakeKeys.label,
      tokenPrefix: intakeKeys.tokenPrefix,
      createdByName: intakeKeys.createdByName,
      createdAt: intakeKeys.createdAt,
      lastUsedAt: intakeKeys.lastUsedAt,
      revokedAt: intakeKeys.revokedAt,
      sources: sql<number>`coalesce(${used.n}, 0)::int`,
    })
    .from(intakeKeys)
    .leftJoin(used, eq(used.keyId, intakeKeys.id))
    .where(inTenant(ctx, intakeKeys))
    .orderBy(desc(intakeKeys.createdAt));
  return rows;
});

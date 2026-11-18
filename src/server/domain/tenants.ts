import { asc, eq } from "drizzle-orm";

import { toMemberRole } from "@/lib/permissions";

import type { Db } from "../db/client";
import { member, organization } from "../db/schema";
import type { Ctx, Tenant, UserRole } from "./context";

/** Networks are Better Auth organizations: one per team or pilot. */
export interface Membership {
  tenant: Tenant;
  role: UserRole;
}

const tenantColumns = { id: organization.id, slug: organization.slug, name: organization.name };

export function userContext(db: Db, membership: Membership, person: { id: string; name: string }): Ctx {
  return { db, tenant: membership.tenant, actor: { type: "user", id: person.id, name: person.name, role: membership.role } };
}

export async function listMemberships(db: Db, userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ tenant: tenantColumns, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));
  return rows.map((row) => ({ tenant: row.tenant, role: toMemberRole(row.role) }));
}

export async function findTenantBySlug(db: Db, slug: string): Promise<Tenant | null> {
  const [tenant] = await db.select(tenantColumns).from(organization).where(eq(organization.slug, slug));
  return tenant ?? null;
}

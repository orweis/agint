import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";

import { slugify } from "@/lib/domain";
import type { MemberRole } from "@/lib/permissions";
import { createPgliteDb, type Db } from "@/server/db/client";
import { migratePgliteClient } from "@/server/db/migrate";
import { member, organization, user } from "@/server/db/schema";
import type { Ctx, Tenant } from "@/server/domain/context";
import { authenticateIntakeKey, intakeContext, issueKey } from "@/server/domain/keys";

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/** A fresh in-memory Postgres with the real migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await migratePgliteClient(client);
  return { db: createPgliteDb(client), close: () => client.close() };
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
}

export async function seedUser(db: Db, name: string): Promise<TestUser> {
  const id = randomUUID();
  const person = { id, name, email: `${name.toLowerCase().replace(/\W+/g, ".")}.${id.slice(0, 8)}@example.com` };
  await db.insert(user).values(person);
  return person;
}

export async function seedTenant(db: Db, slug: string, name = slug): Promise<Tenant> {
  const tenant = { id: randomUUID(), slug, name };
  await db.insert(organization).values({ ...tenant, createdAt: new Date() });
  return tenant;
}

export async function addMember(db: Db, tenant: Tenant, person: TestUser, role: MemberRole): Promise<void> {
  await db.insert(member).values({ id: randomUUID(), organizationId: tenant.id, userId: person.id, role, createdAt: new Date() });
}

export function asUser(db: Db, tenant: Tenant, person: TestUser, role: MemberRole = "owner"): Ctx {
  return { db, tenant, actor: { type: "user", id: person.id, name: person.name, role } };
}

export interface IntakeKey {
  ctx: Ctx;
  token: string;
  keyId: string;
}

/** Issues a real intake key through the service and resolves it the way the MCP endpoint does. */
export async function intakeKey(owner: Ctx, label = "Team key"): Promise<IntakeKey> {
  const { token, keyId } = await issueKey(owner, { label });
  const principal = await authenticateIntakeKey(owner.db, token);
  if (!principal) throw new Error("freshly issued key did not authenticate");
  return { ctx: intakeContext(owner.db, principal), token, keyId };
}

export interface Network {
  tenant: Tenant;
  human: Ctx;
  key: IntakeKey;
}

let networks = 0;

/** A new network with an owner and one intake key, so a test never depends on another's data. */
export async function seedNetwork(db: Db, { name = "Northstar", owner = "Ana" } = {}): Promise<Network> {
  const tenant = await seedTenant(db, `${slugify(name)}-${++networks}`, name);
  const person = await seedUser(db, owner);
  await addMember(db, tenant, person, "owner");
  const human = asUser(db, tenant, person);
  return { tenant, human, key: await intakeKey(human) };
}

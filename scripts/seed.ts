import "./env";

import { eq } from "drizzle-orm";

import { createAuth } from "../src/server/auth/auth";
import { appUrl } from "../src/server/config";
import { getDb } from "../src/server/db/client";
import { user } from "../src/server/db/schema";
import { seedNorthstarStory } from "../src/server/demo/northstar";
import { authenticateIntakeKey, intakeContext, issueKey } from "../src/server/domain/keys";
import { findTenantBySlug, listMemberships, userContext } from "../src/server/domain/tenants";
import { DEMO_NETWORK, DEMO_USER } from "./demo-account";

const db = getDb();
const auth = createAuth(db, appUrl());

const [existing] = await db.select().from(user).where(eq(user.email, DEMO_USER.email));
const owner = existing ?? (await auth.api.signUpEmail({ body: DEMO_USER })).user;

if (await findTenantBySlug(db, DEMO_NETWORK.slug)) {
  console.log(`${DEMO_NETWORK.name} already seeded.`);
} else {
  await auth.api.createOrganization({ body: { ...DEMO_NETWORK, userId: owner.id } });
  const membership = (await listMemberships(db, owner.id)).find((candidate) => candidate.tenant.slug === DEMO_NETWORK.slug)!;
  const ctx = userContext(db, membership, owner);
  const { token } = await issueKey(ctx, { label: "Engineering pilot" });
  const principal = (await authenticateIntakeKey(db, token))!;
  const { sources } = await seedNorthstarStory(ctx, intakeContext(db, principal));
  console.log(`Seeded ${DEMO_NETWORK.name}: ${sources.length} sources. Intake key (local only): ${token}`);
}
console.log(`Sign in as ${DEMO_USER.email} / ${DEMO_USER.password}`);
process.exit(0);

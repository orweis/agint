import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";

import { LIMITS } from "@/lib/domain";

import { appUrl, trustedOrigins } from "../config";
import { lazyDb, type Db } from "../db/client";
import * as authSchema from "../db/schema/auth";

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;

/** People sign in with email and password; networks are Better Auth organizations. */
export function createAuth(database: Db, baseUrl: string) {
  return betterAuth({
    appName: "AGINT",
    baseURL: baseUrl,
    trustedOrigins: [...new Set([baseUrl, ...trustedOrigins()])],
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema }),
    emailAndPassword: { enabled: true, minPasswordLength: LIMITS.passwordMin, maxPasswordLength: LIMITS.passwordMax, autoSignIn: true },
    // Serverless instances do not share memory, so limits are counted in Postgres.
    rateLimit: { storage: "database" },
    plugins: [organization({ creatorRole: "owner", invitationExpiresIn: SEVEN_DAYS_IN_SECONDS }), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

let instance: Auth | undefined;

/** Built on first use: `next build` evaluates this module with no database to open. */
export const auth: Auth = new Proxy({} as Auth, {
  get: (_target, property) => Reflect.get((instance ??= createAuth(lazyDb, appUrl())), property) as unknown,
});

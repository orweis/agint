import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { routes } from "@/lib/routes";

import { getDb } from "../db/client";
import type { Ctx } from "../domain/context";
import { listMemberships, userContext, type Membership } from "../domain/tenants";
import { auth, type Session } from "./auth";

export type SessionUser = Session["user"];

export const getSession = cache(async () => {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(routes.signIn());
  return session.user;
}

export interface Viewer {
  user: SessionUser;
  memberships: Membership[];
}

export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await requireUser();
  return { user, memberships: await listMemberships(getDb(), user.id) };
});

export interface NetworkAccess {
  ctx: Ctx;
  viewer: Viewer;
  membership: Membership;
}

/** A network slug as a domain context for the signed-in member, or 404 (non-members cannot probe slugs). */
export const requireNetwork = cache(async (slug: string): Promise<NetworkAccess> => {
  const viewer = await getViewer();
  const membership = viewer.memberships.find((candidate) => candidate.tenant.slug === slug);
  if (!membership) notFound();
  return { ctx: userContext(getDb(), membership, viewer.user), viewer, membership };
});

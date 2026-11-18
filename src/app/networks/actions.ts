"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/action-state";
import { LIMITS, slugify, WORKSPACE_SLUG_PATTERN } from "@/lib/domain";
import { routes } from "@/lib/routes";
import { attempt } from "@/server/actions";
import { auth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";
import { invalid } from "@/server/domain/errors";

const SLUG = new RegExp(`^${WORKSPACE_SLUG_PATTERN}$`);

export async function createNetworkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, LIMITS.workspaceName);
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const result = await attempt(async () => {
    if (!name) throw invalid("Give the network a name.");
    if (!SLUG.test(slug)) throw invalid("Use lowercase letters, digits and dashes for the address.");
    return auth.api.createOrganization({ body: { name, slug }, headers: await headers() });
  });
  if (!result.ok) return result.state;
  redirect(routes.connect(slug));
}

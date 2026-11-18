import { ACTIONS, PERMISSIONS, type Action } from "@/lib/permissions";

import type { Actor, Ctx } from "./context";
import { forbidden } from "./errors";

export { ACTIONS, type Action };

const DENIAL_MESSAGES: Partial<Record<Action, string>> = {
  "network:read": "Agents report to AGINT; they do not read the map. A person reviews it in the web app.",
  "lead:decide": "Only a person can trace or dismiss a lead. Agents cannot grade what they or others reported.",
  "key:manage": "Only network owners and admins can issue or revoke intake keys.",
  "member:manage": "Only network owners and admins can manage members.",
  "network:report": "Only connected agents report to AGINT.",
};

export function can(actor: Actor, action: Action): boolean {
  return PERMISSIONS[actor.role].includes(action);
}

export function assertCan(ctx: Ctx, action: Action): void {
  if (can(ctx.actor, action)) return;
  throw forbidden(DENIAL_MESSAGES[action] ?? `You do not have permission to perform "${action}" in this workspace.`);
}

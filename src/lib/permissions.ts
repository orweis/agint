/**
 * The authorization matrix, as plain data. Enforcement is `assertCan` in `server/domain/policy.ts`.
 * Agents only report: they cannot read the map, grade themselves, trace or dismiss a lead, or issue keys.
 */
export const ACTIONS = ["network:read", "network:report", "lead:decide", "key:manage", "member:manage"] as const;
export type Action = (typeof ACTIONS)[number];

export const MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type PolicyRole = MemberRole | "agent";

export const PERMISSIONS: Record<PolicyRole, readonly Action[]> = {
  owner: ["network:read", "lead:decide", "key:manage", "member:manage"],
  admin: ["network:read", "lead:decide", "key:manage", "member:manage"],
  member: ["network:read", "lead:decide"],
  agent: ["network:report"],
};

export function toMemberRole(role: string): MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(role) ? (role as MemberRole) : "member";
}

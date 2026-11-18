"use server";

import { tenantAction } from "@/server/actions";
import { dismissEntity, reopenEntity, traceEntity } from "@/server/domain/decisions";
import { issueKey, revokeKey } from "@/server/domain/keys";

export const issueKeyAction = tenantAction(issueKey, { success: "Key issued. Copy it now: it is shown once.", data: (out) => ({ token: out.token, label: out.label }) });
export const revokeKeyAction = tenantAction(revokeKey, { success: (out) => `Revoked “${out.label}”. Agents using it can no longer report.` });
export const traceAction = tenantAction(traceEntity, { success: (out) => `Traced “${out.label}”.` });
export const dismissAction = tenantAction(dismissEntity, { success: (out) => `Dismissed “${out.label}”.` });
export const reopenAction = tenantAction(reopenEntity, { success: (out) => `Reopened “${out.label}”.` });

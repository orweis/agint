import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { can } from "@/server/domain/policy";
import { listKeys } from "@/server/domain/keys";
import { absoluteUrl } from "@/server/web";

import { revokeKeyAction } from "../actions";
import { ConnectSetup } from "./setup";

export const metadata: Metadata = { title: "Connect" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function ConnectPage({ params }: PageProps<"/n/[slug]/connect">) {
  const { slug } = await params;
  const { ctx } = await requireNetwork(slug);
  const keys = await listKeys(ctx, {});
  const canIssue = can(ctx.actor, "key:manage");
  const mcpUrl = await absoluteUrl(routes.mcp());
  const origin = new URL(mcpUrl).origin;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Connect agents</h1>
        <p className="mt-1 text-muted">Nothing to install, no traffic to reroute. Give an agent the key and one sentence; it becomes a source and starts debriefing.</p>
      </div>
      <Card labelledBy="setup">
        <CardHeader id="setup" title="Set up a source" />
        <div className="p-5">
          <ConnectSetup slug={slug} mcpUrl={mcpUrl} origin={origin} canIssue={canIssue} />
        </div>
      </Card>
      <Card labelledBy="keys">
        <CardHeader id="keys" title="Intake keys" description="Revoking a key cuts off every agent that reports with it, on its next call." />
        {keys.length === 0 ? (
          <p className="p-5 text-sm text-muted">No keys yet.{canIssue ? " Issue one above." : " Ask an owner or admin to issue one."}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {key.label} {key.revokedAt && <Badge tone="neutral">Revoked</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    <code className="font-mono text-xs">{key.tokenPrefix}…</code> · {key.sources} source{key.sources === 1 ? "" : "s"} · issued by {key.createdByName} on {dateFormat.format(key.createdAt)}
                    {key.lastUsedAt ? ` · last used ${dateFormat.format(key.lastUsedAt)}` : " · never used"}
                  </p>
                </div>
                {canIssue && !key.revokedAt && (
                  <ActionForm action={revokeKeyAction} network={slug} fields={{ keyId: key.id }} submit="Revoke" variant="danger" size="sm" confirm={`Revoke “${key.label}”? ${key.sources} source(s) using it will stop reporting.`} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

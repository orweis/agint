import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/pages/page-header";
import { RelativeTime } from "@/components/pages/time";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SIGNAL_META } from "@/lib/domain";
import { formatDate, formatDateTime, isQuiet, orUnknown, plural, runtimeLabel } from "@/lib/format";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { getNetworkMap, listSources } from "@/server/domain/map";

export const metadata: Metadata = { title: "Sources" };

const TH = "px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted";
const TD = "px-4 py-3 align-top";
const PINNED = "sticky left-0 z-10 bg-panel";

export default async function SourcesPage({ params }: PageProps<"/n/[slug]/sources">) {
  const { slug } = await params;
  const { ctx } = await requireNetwork(slug);
  const [sources, map] = await Promise.all([listSources(ctx, {}), getNetworkMap(ctx, {})]);
  const unconnected = map.nodes.filter((node) => node.kind === "agent" && (node.state === "lead" || node.state === "corroborated")).length;
  const now = new Date(map.generatedAt);

  return (
    <>
      <PageHeader
        title="Sources"
        description={
          <p>
            Every agent that connected and reports for itself: who it works for, what it is doing and where it runs, as it says. Fields an agent did not report read
            “Unknown”.
          </p>
        }
      />

      <p className="mb-4 text-sm text-ink-2">
        <span className="figure text-ink">{sources.length}</span> {sources.length === 1 ? "source" : "sources"} reporting ·{" "}
        <span className="figure text-ink">{unconnected}</span> {unconnected === 1 ? "agent" : "agents"} seen but not connected
        {unconnected > 0 && (
          <>
            {" "}
            ·{" "}
            <Link href={`${routes.leads(slug)}?kind=agent`} className="link">
              See them in Leads
            </Link>
          </>
        )}
      </p>

      {sources.length === 0 ? (
        <EmptyState title="No sources yet">
          <p>An agent becomes a source when it connects and debriefs. Hand it an intake key and the setup from Connect.</p>
          <div className="mt-4">
            <ButtonLink href={routes.connect(slug)} variant="primary" size="sm">
              Connect an agent
            </ButtonLink>
          </div>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-panel">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <caption className="sr-only">Connected sources, most recent report first</caption>
            <thead className="border-b border-rule">
              <tr>
                <th scope="col" className={`${TH} ${PINNED}`}>
                  Name
                </th>
                <th scope="col" className={TH}>
                  Harness
                </th>
                <th scope="col" className={TH}>
                  Runtime
                </th>
                <th scope="col" className={TH}>
                  Host
                </th>
                <th scope="col" className={TH}>
                  Works for
                </th>
                <th scope="col" className={TH}>
                  Current task
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Reports
                </th>
                <th scope="col" className={TH}>
                  Last report
                </th>
                <th scope="col" className={TH}>
                  First seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {sources.map((source) => {
                const quiet = isQuiet(source.lastSeenAt, source.checkedOutAt, now);
                return (
                  <tr key={source.agentId} className="hover:bg-fill/50">
                    <th scope="row" className={`${TD} ${PINNED} max-w-56 text-left font-semibold`}>
                      <Link href={routes.entity(slug, source.entityId)} className="link wrap-anywhere">
                        {source.name}
                      </Link>
                      {source.model && <div className="mt-0.5 text-xs font-normal text-muted wrap-anywhere">{source.model}</div>}
                    </th>
                    <td className={`${TD} text-ink-2`}>{orUnknown(source.harness)}</td>
                    <td className={`${TD} text-ink-2`}>{runtimeLabel(source.runtime)}</td>
                    <td className={`${TD} max-w-48 text-ink-2 wrap-anywhere`}>{orUnknown(source.host)}</td>
                    <td className={`${TD} max-w-48 wrap-anywhere`}>
                      {source.principalName ? <span className="text-ink-2">{source.principalName}</span> : <span className="text-muted">Not reported</span>}
                    </td>
                    <td className={`${TD} max-w-80`}>
                      {source.task ? <span className="line-clamp-2 text-ink-2" title={source.task}>{source.task}</span> : <span className="text-muted">Not reported</span>}
                    </td>
                    <td className={`${TD} figure text-right font-normal text-ink-2`}>{source.reportCount}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RelativeTime value={source.lastSeenAt} now={now} className="text-ink-2" />
                        {source.checkedOutAt ? (
                          <Badge tone="neutral" title={`Checked out ${formatDateTime(source.checkedOutAt)}`}>
                            Checked out
                          </Badge>
                        ) : (
                          quiet && (
                            <Badge tone={SIGNAL_META.stale_source.tone} title={SIGNAL_META.stale_source.description}>
                              {SIGNAL_META.stale_source.label}
                            </Badge>
                          )
                        )}
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-2`}>
                      <time dateTime={source.firstSeenAt.toISOString()} title={formatDateTime(source.firstSeenAt)}>
                        {formatDate(source.firstSeenAt)}
                      </time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sources.length > 0 && <p className="mt-3 text-xs text-muted">{plural(sources.length, "source")}. Times in UTC. A source is quiet after a day without a report.</p>}
    </>
  );
}

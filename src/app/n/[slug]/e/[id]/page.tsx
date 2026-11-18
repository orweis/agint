import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BasisBadge } from "@/components/pages/basis-badge";
import { DecisionActions } from "@/components/pages/decision-actions";
import { EventLog } from "@/components/pages/event-log";
import { KindIcon } from "@/components/pages/kind-icon";
import { NextStepBox } from "@/components/pages/next-step";
import { StateBadge } from "@/components/pages/state-badge";
import { RelativeTime } from "@/components/pages/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ENTITY_KIND_META, ENTITY_STATE_META, RELATION_META, SIGNAL_META } from "@/lib/domain";
import { formatDate, formatDateTime, isQuiet, orUnknown, plural, runtimeLabel } from "@/lib/format";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { getDossier, type Dossier, type DossierEdge } from "@/server/domain/map";
import { can } from "@/server/domain/policy";
import { orNotFound } from "@/server/web";

export async function generateMetadata({ params }: PageProps<"/n/[slug]/e/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const { ctx } = await requireNetwork(slug);
  const dossier = await orNotFound(getDossier(ctx, { entityId: id }));
  return { title: `${dossier.node.label} · Dossier` };
}

export default async function DossierPage({ params }: PageProps<"/n/[slug]/e/[id]">) {
  const { slug, id } = await params;
  const { ctx } = await requireNetwork(slug);
  const dossier = await orNotFound(getDossier(ctx, { entityId: id }));
  const { node } = dossier;
  const now = new Date();
  const stateMeta = ENTITY_STATE_META[node.state];
  const decided = node.state === "traced" || node.state === "dismissed";
  const outgoing = dossier.edges.filter((edge) => edge.direction === "out");
  const incoming = dossier.edges.filter((edge) => edge.direction === "in");
  const attributes = Object.entries(node.attributes).filter(([, value]) => value.trim() !== "");

  return (
    <article className="space-y-6">
      <Link href={routes.network(slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Back to map
      </Link>

      <header className="space-y-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
          <KindIcon kind={node.kind} />
          {ENTITY_KIND_META[node.kind].label}
        </p>
        <h1 className="text-2xl font-bold text-ink wrap-anywhere">{node.label}</h1>
        {node.ref && node.ref !== node.label && <p className="font-mono text-sm text-muted wrap-anywhere">{node.ref}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={node.state} />
          <span className="text-sm text-ink-2">{stateMeta.description}</span>
        </div>
        <p className="text-sm text-muted">
          {node.state === "source"
            ? `Reports for itself. ${node.reporterCount > 0 ? `Also seen by ${plural(node.reporterCount, "other source")}.` : ""}`
            : node.state === "reference"
              ? "Only mentioned so far."
              : `Seen by ${plural(node.reporterCount, "source")}.`}{" "}
          First seen <RelativeTime value={node.firstSeenAt} now={now} />, last seen <RelativeTime value={node.lastSeenAt} now={now} />.
        </p>
      </header>

      {decided && dossier.decision && (
        <div className="rounded-lg border border-rule bg-panel px-5 py-4">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{stateMeta.label}</span> by {orUnknown(dossier.decision.byName, "a person")}
            {dossier.decision.at && (
              <>
                {" "}
                <RelativeTime value={dossier.decision.at} now={now} />
              </>
            )}
            .
          </p>
          <p className="mt-1 text-sm text-ink-2 wrap-anywhere">{dossier.decision.note ? <>“{dossier.decision.note}”</> : <span className="text-muted">No note left.</span>}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-6">
          {node.signals.length > 0 && (
            <Card labelledBy="signals">
              <CardHeader id="signals" title="Signals" description="Pointers worth a look. They never grant or deny anything." />
              <ul className="divide-y divide-rule">
                {node.signals.map((signal) => (
                  <li key={signal} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-3">
                    <span className="shrink-0">
                      <Badge tone={SIGNAL_META[signal].tone}>{SIGNAL_META[signal].label}</Badge>
                    </span>
                    <span className="text-sm text-ink-2">{SIGNAL_META[signal].description}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {node.source && <SourceProfileCard dossier={dossier} now={now} />}

          {attributes.length > 0 && (
            <Card labelledBy="reported-facts">
              <CardHeader id="reported-facts" title="Reported details" description="As a source gave them. Secret values are withheld before storage." />
              <dl className="divide-y divide-rule">
                {attributes.map(([key, value]) => (
                  <Row key={key} label={key}>
                    <span className="font-mono text-xs wrap-anywhere">{value}</span>
                  </Row>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Next steps">
          <NextStepBox node={node} />
          {node.state !== "source" && can(ctx.actor, "lead:decide") && (
            <div className="rounded-lg border border-rule bg-panel px-4 py-4">
              <p className="mb-3 text-sm font-semibold text-ink">{decided ? "Undo this call" : "Your call"}</p>
              <DecisionActions slug={slug} entityId={node.id} label={node.label} state={node.state} />
            </div>
          )}
          {node.source && <p className="text-sm text-muted">A source cannot be traced or dismissed here. To cut it off, revoke its intake key from Connect.</p>}
        </aside>
      </div>

      <Card labelledBy="relationships">
        <CardHeader
          id="relationships"
          title="Reported relationships"
          description="Every edge with who reported it and how they know. Configured is not accessed; a mention is not a sighting."
        />
        {dossier.edges.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No relationships reported yet.</p>
        ) : (
          <div className="space-y-6 py-4">
            <EdgeTable title="Outgoing" description={`What ${node.label} does and touches.`} edges={outgoing} slug={slug} subject={node.label} />
            <EdgeTable title="Incoming" description={`Who reported ${node.label}, and who uses it.`} edges={incoming} slug={slug} subject={node.label} />
          </div>
        )}
      </Card>

      <section aria-labelledby="debriefs" className="space-y-3">
        <h2 id="debriefs" className="font-semibold text-ink">
          Debriefs about {node.label}
        </h2>
        {dossier.events.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged about it yet.</p>
        ) : (
          <EventLog slug={slug} events={dossier.events} now={now} linkEntities={false} headingLevel={3} />
        )}
      </section>
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-5 py-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-muted wrap-anywhere">{label}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}

function NotReported() {
  return <span className="text-muted">Not reported</span>;
}

function SourceProfileCard({ dossier, now }: { dossier: Dossier; now: Date }) {
  const source = dossier.node.source;
  if (!source) return null;
  const quiet = isQuiet(source.lastSeenAt, source.checkedOutAt, now);
  return (
    <Card labelledBy="profile">
      <CardHeader id="profile" title="Profile" description="What this source says about itself." />
      <dl className="divide-y divide-rule">
        <Row label="Harness">{orUnknown(source.harness)}</Row>
        <Row label="Model">{source.model ?? <NotReported />}</Row>
        <Row label="Runtime">{runtimeLabel(source.runtime)}</Row>
        <Row label="Host">{source.host ? <span className="wrap-anywhere">{source.host}</span> : <NotReported />}</Row>
        <Row label="Works for">{source.principalName ?? <NotReported />}</Row>
        <Row label="Current task">{source.task ? <span className="wrap-anywhere">{source.task}</span> : <NotReported />}</Row>
        <Row label="Session">{dossier.sessionRef ? <span className="font-mono text-xs wrap-anywhere">{dossier.sessionRef}</span> : <NotReported />}</Row>
        <Row label="Reports">
          <span className="tabular-nums">{source.reportCount}</span>
        </Row>
        <Row label="First seen">
          <time dateTime={source.firstSeenAt}>{formatDateTime(source.firstSeenAt)}</time>
        </Row>
        <Row label="Last report">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <RelativeTime value={source.lastSeenAt} now={now} />
            {source.checkedOutAt ? (
              <Badge title={`Checked out ${formatDateTime(source.checkedOutAt)}`}>Checked out</Badge>
            ) : (
              quiet && (
                <Badge tone={SIGNAL_META.stale_source.tone} title={SIGNAL_META.stale_source.description}>
                  {SIGNAL_META.stale_source.label}
                </Badge>
              )
            )}
          </span>
        </Row>
      </dl>
    </Card>
  );
}

const TH = "px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted";
const TD = "px-4 py-3 align-top";

function EdgeTable({ title, description, edges, slug, subject }: { title: string; description: string; edges: DossierEdge[]; slug: string; subject: string }) {
  const headingId = `edges-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="px-5 pb-2">
        <h3 id={headingId} className="text-sm font-semibold text-ink">
          {title} <span className="figure text-muted">{edges.length}</span>
        </h3>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {edges.length === 0 ? (
        <p className="px-5 text-sm text-muted">None reported.</p>
      ) : (
        <div className="overflow-x-auto border-y border-rule">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className={`${TH} sticky left-0 z-10 bg-panel`}>
                  Relationship
                </th>
                <th scope="col" className={TH}>
                  Reported by
                </th>
                <th scope="col" className={TH}>
                  Basis
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Reports
                </th>
                <th scope="col" className={TH}>
                  First
                </th>
                <th scope="col" className={TH}>
                  Last
                </th>
                <th scope="col" className={TH}>
                  Latest summaries
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {edges.map((edge) => (
                <tr key={edge.id}>
                  <th scope="row" className={`${TD} sticky left-0 z-10 max-w-72 bg-panel text-left font-normal`}>
                    {edge.direction === "out" && (
                      <span className="block text-xs text-muted wrap-anywhere">
                        {subject} {RELATION_META[edge.relation].phrase}
                      </span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <KindIcon kind={edge.other.kind} className="size-3.5 text-muted" />
                      <span className="sr-only">{ENTITY_KIND_META[edge.other.kind].label}: </span>
                      <Link href={routes.entity(slug, edge.other.id)} className="link font-semibold wrap-anywhere">
                        {edge.other.label}
                      </Link>
                      <StateBadge state={edge.other.state} />
                    </span>
                    {edge.direction === "in" && (
                      <span className="mt-0.5 block text-xs text-muted wrap-anywhere">
                        {RELATION_META[edge.relation].phrase} {subject}
                      </span>
                    )}
                  </th>
                  <td className={`${TD} text-ink-2`}>{edge.reporterName}</td>
                  <td className={TD}>
                    <BasisBadge basis={edge.basis} />
                  </td>
                  <td className={`${TD} text-right text-ink-2 tabular-nums`}>{edge.count}</td>
                  <td className={`${TD} whitespace-nowrap text-ink-2`}>
                    <time dateTime={edge.firstAt.toISOString()} title={formatDateTime(edge.firstAt)}>
                      {formatDate(edge.firstAt)}
                    </time>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-ink-2`}>
                    <time dateTime={edge.lastAt.toISOString()} title={formatDateTime(edge.lastAt)}>
                      {formatDate(edge.lastAt)}
                    </time>
                  </td>
                  <td className={`${TD} max-w-96 text-ink-2`}>
                    {edge.recent.length === 0 ? (
                      <span className="text-muted">None given</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {edge.recent.map((summary, index) => (
                          <li key={index} className="wrap-anywhere">
                            {summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

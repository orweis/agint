import type { Metadata } from "next";
import Link from "next/link";

import { DecisionActions } from "@/components/pages/decision-actions";
import { FilterCapsules } from "@/components/pages/filter-capsules";
import { KindLabel } from "@/components/pages/kind-icon";
import { nextStepOf } from "@/components/pages/next-step";
import { EmptyState, PageHeader } from "@/components/pages/page-header";
import { SignalBadges, StateBadge } from "@/components/pages/state-badge";
import { RelativeTime } from "@/components/pages/time";
import { ENTITY_KIND_META, ENTITY_KINDS, ENTITY_STATE_META, isOneOf, type EntityState } from "@/lib/domain";
import { plural } from "@/lib/format";
import { isSighted, type MapNode } from "@/lib/network-map";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { getNetworkMap } from "@/server/domain/map";
import { can } from "@/server/domain/policy";

export const metadata: Metadata = { title: "Leads" };

type QueueState = Exclude<EntityState, "source">;

/** The queue's order, and how each group is introduced. Decided and heard-of groups start collapsed. */
const GROUPS: { state: QueueState; title: string; blurb: string; collapsed: boolean }[] = [
  { state: "corroborated", title: "Corroborated", blurb: "Seen by two or more independent sources. Still a lead, not a fact: trace it or dismiss it.", collapsed: false },
  { state: "lead", title: "Leads", blurb: "Seen by one source. Waiting for a second source, a connection, or a trace.", collapsed: false },
  { state: "reference", title: "References", blurb: "Heard of, not seen; not counted. A source only mentioned these.", collapsed: true },
  { state: "traced", title: "Traced", blurb: "Confirmed by a person through identity, runtime or CI evidence.", collapsed: true },
  { state: "dismissed", title: "Dismissed", blurb: "Ruled out by a person.", collapsed: true },
];
const QUEUE_STATES = GROUPS.map((group) => group.state);

const SCOPES = ["seen", "reach"] as const;
type Scope = (typeof SCOPES)[number];

function leadsHref(slug: string, filter: { kind?: string; state?: string; scope?: Scope }): string {
  const query = new URLSearchParams();
  if (filter.scope && filter.scope !== "seen") query.set("scope", filter.scope);
  if (filter.kind) query.set("kind", filter.kind);
  if (filter.state) query.set("state", filter.state);
  const search = query.toString();
  return search ? `${routes.leads(slug)}?${search}` : routes.leads(slug);
}

export default async function LeadsPage({ params, searchParams }: PageProps<"/n/[slug]/leads">) {
  const { slug } = await params;
  const query = await searchParams;
  const kind = isOneOf(ENTITY_KINDS, query.kind) ? query.kind : undefined;
  const state = isOneOf(QUEUE_STATES, query.state) ? query.state : undefined;
  const scope: Scope = isOneOf(SCOPES, query.scope) ? query.scope : "seen";

  const { ctx } = await requireNetwork(slug);
  const map = await getNetworkMap(ctx, {});
  const now = new Date(map.generatedAt);
  const canDecide = can(ctx.actor, "lead:decide");

  const sourceNames = new Map<string, string>();
  for (const node of map.nodes) if (node.source) sourceNames.set(node.source.agentId, node.label);
  const reportersOf = new Map<string, Set<string>>();
  for (const edge of map.edges) {
    for (const id of [edge.source, edge.target]) {
      const set = reportersOf.get(id) ?? new Set<string>();
      for (const reporter of edge.reporterIds) set.add(reporter);
      reportersOf.set(id, set);
    }
  }
  const reporterNames = (node: MapNode) =>
    [...(reportersOf.get(node.id) ?? [])]
      .filter((agentId) => agentId !== node.source?.agentId)
      .map((agentId) => sourceNames.get(agentId) ?? "an agent no longer listed")
      .sort((a, b) => a.localeCompare(b));

  const nonSources = map.nodes.filter((node) => node.state !== "source");
  const sighted = nonSources.filter((node) => isSighted(node, map.edges));
  const reach = nonSources.filter((node) => !isSighted(node, map.edges));
  const queue = scope === "seen" ? sighted : reach;
  const kinds = ENTITY_KINDS.filter((candidate) => queue.some((node) => node.kind === candidate));
  const byKind = kind ? queue.filter((node) => node.kind === kind) : queue;
  const groups = GROUPS.filter((group) => !state || group.state === state).map((group) => ({
    ...group,
    nodes: byKind.filter((node) => node.state === group.state).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
  }));
  const open = byKind.filter((node) => node.state === "lead" || node.state === "corroborated").length;

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          <p>
            {scope === "seen"
              ? "What sources saw from where they run that is not their own: other agents, keys they were not issued, MCP servers, shared jobs. Each finding is a lead, never a fact. Nothing here is probed or contacted automatically."
              : "What sources reported in their own reach: repositories, tools, services, hosts and people they work for. Each is one source's claim until another source reports it too."}
          </p>
        }
      />

      <div className="mb-6 space-y-2">
        <FilterCapsules
          label="Show"
          options={[
            { label: "Seen, not connected", href: leadsHref(slug, {}), current: scope === "seen", count: sighted.length },
            { label: "In a source's reach", href: leadsHref(slug, { scope: "reach" }), current: scope === "reach", count: reach.length },
          ]}
        />
        <FilterCapsules
          label="Kind"
          options={[
            { label: "All", href: leadsHref(slug, { state, scope }), current: !kind },
            ...kinds.map((candidate) => ({
              label: ENTITY_KIND_META[candidate].plural,
              href: leadsHref(slug, { kind: candidate, state, scope }),
              current: kind === candidate,
              count: queue.filter((node) => node.kind === candidate && (!state || node.state === state)).length,
            })),
          ]}
        />
        <FilterCapsules
          label="State"
          options={[
            { label: "All", href: leadsHref(slug, { kind, scope }), current: !state },
            ...GROUPS.map((group) => ({
              label: ENTITY_STATE_META[group.state].label,
              href: leadsHref(slug, { kind, state: group.state, scope }),
              current: state === group.state,
              count: byKind.filter((node) => node.state === group.state).length,
            })),
          ]}
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState title="No leads yet">
          <p>Leads appear when a source reports something that is not its own: another agent on its machine, an MCP server, a key it was not issued.</p>
          <p className="mt-2">
            <Link href={routes.connect(slug)} className="link">
              Connect an agent
            </Link>{" "}
            to start the picture.
          </p>
        </EmptyState>
      ) : (
        <>
          {!state && (
            <p className="mb-4 text-sm text-ink-2">
              <span className="figure text-ink">{open}</span> open {open === 1 ? "finding" : "findings"}
              {kind ? ` among ${ENTITY_KIND_META[kind].plural.toLowerCase()}` : ""}.
            </p>
          )}
          <div className="space-y-6">
            {groups.map((group) => {
              const headingId = `group-${group.state}`;
              const list =
                group.nodes.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">Nothing here{kind ? ` for ${ENTITY_KIND_META[kind].plural.toLowerCase()}` : ""}.</p>
                ) : (
                  <ul className="divide-y divide-rule">
                    {group.nodes.map((node) => (
                      <LeadRow key={node.id} slug={slug} node={node} now={now} reporters={reporterNames(node)} canDecide={canDecide} />
                    ))}
                  </ul>
                );
              const heading = (
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{group.title}</span>
                  <span className="figure text-sm text-muted">{group.nodes.length}</span>
                </span>
              );
              if (group.collapsed && !state) {
                return (
                  <section key={group.state} aria-labelledby={headingId} className="rounded-lg border border-rule bg-panel">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
                        <h2 id={headingId} className="flex items-center gap-2">
                          <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
                            ›
                          </span>
                          {heading}
                        </h2>
                        <span className="mt-0.5 block pl-4 text-sm text-muted">{group.blurb}</span>
                      </summary>
                      <div className="border-t border-rule">{list}</div>
                    </details>
                  </section>
                );
              }
              return (
                <section key={group.state} aria-labelledby={headingId} className="rounded-lg border border-rule bg-panel">
                  <div className="border-b border-rule px-5 py-4">
                    <h2 id={headingId}>{heading}</h2>
                    <p className="mt-0.5 text-sm text-muted">{group.blurb}</p>
                  </div>
                  {list}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function LeadRow({ slug, node, now, reporters, canDecide }: { slug: string; node: MapNode; now: Date; reporters: string[]; canDecide: boolean }) {
  const step = nextStepOf(node);
  const seenBy = node.state === "reference" ? `mentioned by ${plural(reporters.length, "source")}` : `seen by ${plural(node.reporterCount, "source")}`;
  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <KindLabel kind={node.kind} />
            <StateBadge state={node.state} />
            <SignalBadges signals={node.signals} />
          </div>
          <h3 className="font-semibold wrap-anywhere">
            <Link href={routes.entity(slug, node.id)} className="link">
              {node.label}
            </Link>
          </h3>
          {node.ref && node.ref !== node.label && <p className="font-mono text-xs text-muted wrap-anywhere">{node.ref}</p>}
          <p className="text-sm text-ink-2">
            <span className="font-semibold">{seenBy.charAt(0).toUpperCase() + seenBy.slice(1)}</span>
            {reporters.length > 0 && <> · reported by {reporters.join(", ")}</>}
          </p>
          <p className="text-xs text-muted">
            First seen <RelativeTime value={node.firstSeenAt} now={now} /> · last seen <RelativeTime value={node.lastSeenAt} now={now} />
          </p>
          {step && node.state !== "traced" && node.state !== "dismissed" && (
            <p className="text-sm text-ink-2">
              <span className="text-muted">What moves it on: </span>
              {step.title}
            </p>
          )}
        </div>
        {canDecide && (
          <div className="w-full lg:w-auto lg:max-w-md lg:min-w-80">
            <DecisionActions slug={slug} entityId={node.id} label={node.label} state={node.state} />
          </div>
        )}
      </div>
    </li>
  );
}

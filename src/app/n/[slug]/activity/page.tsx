import type { Metadata } from "next";
import Link from "next/link";

import { EVENT_LABELS, EventLog } from "@/components/pages/event-log";
import { FilterCapsules } from "@/components/pages/filter-capsules";
import { EmptyState, PageHeader } from "@/components/pages/page-header";
import { ButtonLink } from "@/components/ui/button";
import { isOneOf, type EventKind } from "@/lib/domain";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { listEvents } from "@/server/domain/map";

export const metadata: Metadata = { title: "Debriefs" };

const PAGE_SIZE = 100;

/** The kinds a person filters by, in the order a debrief happens. */
const FILTER_KINDS = ["check_in", "activity", "sighting", "task", "check_out", "lead_connected", "corroborated", "traced", "dismissed"] as const satisfies readonly EventKind[];


function activityHref(slug: string, filter: { kind?: string; before?: number }): string {
  const query = new URLSearchParams();
  if (filter.kind) query.set("kind", filter.kind);
  if (filter.before) query.set("before", String(filter.before));
  const search = query.toString();
  return search ? `${routes.activity(slug)}?${search}` : routes.activity(slug);
}

export default async function ActivityPage({ params, searchParams }: PageProps<"/n/[slug]/activity">) {
  const { slug } = await params;
  const query = await searchParams;
  const kind = isOneOf(FILTER_KINDS, query.kind) ? query.kind : undefined;
  const beforeRaw = typeof query.before === "string" ? Number.parseInt(query.before, 10) : Number.NaN;
  const before = Number.isSafeInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;

  const { ctx } = await requireNetwork(slug);
  const events = await listEvents(ctx, { limit: PAGE_SIZE, kind, before });
  const now = new Date();

  const oldest = events.at(-1);

  return (
    <>
      <PageHeader
        title="Debriefs"
        description={<p>Everything sources reported and every call a person made, newest first. Times in UTC.</p>}
      />

      <div className="mb-6">
        <FilterCapsules
          label="Kind"
          options={[
            { label: "All", href: activityHref(slug, {}), current: !kind },
            ...FILTER_KINDS.map((candidate) => ({ label: EVENT_LABELS[candidate], href: activityHref(slug, { kind: candidate }), current: kind === candidate })),
          ]}
        />
      </div>

      {events.length === 0 ? (
        <EmptyState title={before ? "No older debriefs" : kind ? `No ${EVENT_LABELS[kind].toLowerCase()} yet` : "No debriefs yet"}>
          {before ? (
            <p>
              You have reached the start of the log.{" "}
              <Link href={activityHref(slug, { kind })} className="link">
                Back to the newest
              </Link>
            </p>
          ) : (
            <p>
              Sources debrief when they check in, work and check out.{" "}
              <Link href={routes.connect(slug)} className="link">
                Connect an agent
              </Link>{" "}
              to start the log.
            </p>
          )}
        </EmptyState>
      ) : (
        <EventLog slug={slug} events={events} now={now} />
      )}

      {(before || (oldest && events.length === PAGE_SIZE)) && (
        <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center gap-2">
          {before && (
            <ButtonLink href={activityHref(slug, { kind })} variant="ghost" size="sm">
              Newest
            </ButtonLink>
          )}
          {oldest && events.length === PAGE_SIZE && (
            <ButtonLink href={activityHref(slug, { kind, before: oldest.id })} variant="secondary" size="sm">
              Older
            </ButtonLink>
          )}
        </nav>
      )}
    </>
  );
}

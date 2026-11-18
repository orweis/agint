import { Bot, Cog, User } from "lucide-react";
import Link from "next/link";

import { cx } from "@/lib/cx";
import type { EventKind } from "@/lib/domain";
import { dayKey, formatClock, formatDateTime, formatDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { EventView } from "@/server/domain/map";

export const EVENT_LABELS: Record<EventKind, string> = {
  check_in: "Check-ins",
  activity: "Activity",
  sighting: "Sightings",
  task: "Tasks",
  check_out: "Check-outs",
  lead_connected: "Leads connected",
  corroborated: "Corroborated",
  traced: "Traced",
  dismissed: "Dismissed",
  reopened: "Reopened",
  key_issued: "Keys issued",
  key_revoked: "Keys revoked",
};

/** What one event is, in the singular, for its line. */
const EVENT_LINE_LABELS: Record<EventKind, string> = {
  check_in: "Check-in",
  activity: "Activity",
  sighting: "Sighting",
  task: "Task",
  check_out: "Check-out",
  lead_connected: "Lead connected",
  corroborated: "Corroborated",
  traced: "Traced",
  dismissed: "Dismissed",
  reopened: "Reopened",
  key_issued: "Key issued",
  key_revoked: "Key revoked",
};

const ACTORS = {
  agent: { icon: Bot, className: "font-semibold text-source-ink", label: "Agent" },
  user: { icon: User, className: "font-semibold text-person-ink", label: "Person" },
  system: { icon: Cog, className: "font-normal italic text-muted", label: "System" },
} as const;

/**
 * The debrief log grouped by UTC day, newest first. `linkEntities` adds a link to each event's node;
 * a dossier turns it off for its own node.
 */
export function EventLog({ slug, events, now, linkEntities = true, headingLevel = 2 }: { slug: string; events: EventView[]; now: Date; linkEntities?: boolean; headingLevel?: 2 | 3 }) {
  const days: { key: string; events: EventView[] }[] = [];
  for (const event of events) {
    const key = dayKey(event.createdAt);
    const last = days.at(-1);
    if (last?.key === key) last.events.push(event);
    else days.push({ key, events: [event] });
  }
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="rounded-lg border border-rule bg-panel">
          <Heading id={`day-${day.key}`} className="border-b border-rule px-5 py-3 text-sm font-semibold text-ink">
            {formatDay(day.key, now)}
          </Heading>
          <ol className="divide-y divide-rule">
            {day.events.map((event) => (
              <EventLine key={event.id} slug={slug} event={event} linkEntity={linkEntities} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** One line of the log. A person, an agent and the system each read differently, not by colour alone. */
function EventLine({ slug, event, linkEntity }: { slug: string; event: EventView; linkEntity: boolean }) {
  const actor = ACTORS[event.actorType];
  const Icon = actor.icon;
  return (
    <li className="flex gap-3 px-4 py-3 text-sm sm:px-5">
      <time dateTime={event.createdAt.toISOString()} title={formatDateTime(event.createdAt)} className="w-11 shrink-0 pt-px text-muted tabular-nums">
        {formatClock(event.createdAt)}
      </time>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cx("inline-flex min-w-0 items-center gap-1 wrap-anywhere", actor.className)}>
            <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="sr-only">{actor.label}: </span>
            {event.actorType === "system" ? "AGINT" : event.actorName}
          </span>
          <span className="text-xs text-muted">{EVENT_LINE_LABELS[event.kind]}</span>
        </p>
        <p className="mt-0.5 text-ink-2 wrap-anywhere">
          {event.summary}
          {linkEntity && event.entityId && (
            <>
              {" "}
              <Link href={routes.entity(slug, event.entityId)} className="link whitespace-nowrap">
                Open dossier
              </Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

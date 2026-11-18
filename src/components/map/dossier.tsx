"use client";

import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { ENTITY_KIND_META, ENTITY_STATE_META, SIGNAL_META } from "@/lib/domain";
import {
  BASIS_LABEL,
  accessOf,
  attentionList,
  connectionsOf,
  formatAgo,
  formatWhen,
  harnessLabel,
  isAggregate,
  isSource,
  nextSteps,
  nodeSubtitle,
  reportersOf,
  roleOf,
  type MapCounters,
  type MapGraph,
  type MapIndex,
} from "@/lib/map-model";
import type { MapNode } from "@/lib/network-map";
import { routes } from "@/lib/routes";

import { GlyphIcon, TONE_CHIP, specOf } from "./glyph";

function Chip({ tone, children }: { tone: keyof typeof TONE_CHIP; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", TONE_CHIP[tone])}>{children}</span>;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-rule px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{title}</h3>
        {aside ? <span className="text-xs text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function NodeButton({ node, index, now, onSelect, note }: { node: MapNode; index: MapIndex; now: string; onSelect: (id: string) => void; note?: ReactNode }) {
  return (
    <button type="button" onClick={() => onSelect(node.id)} className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-fill">
      <GlyphIcon spec={specOf(node, roleOf(index, node.id))} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{node.label}</span>
        <span className="block truncate text-xs text-muted">{note ?? nodeSubtitle(node, now)}</span>
      </span>
    </button>
  );
}

const names = (nodes: MapNode[]) => nodes.map((node) => node.label).join(", ");

interface DossierProps {
  node: MapNode;
  index: MapIndex;
  now: string;
  slug: string;
  onSelect: (id: string | null) => void;
  /** Members, when the node stands for a group. */
  members: MapNode[] | null;
  onExpand: (id: string) => void;
}

/** Everything AGINT knows about one node, and who told it. */
export function Dossier({ node, index, now, slug, onSelect, members, onExpand }: DossierProps) {
  const role = roleOf(index, node.id);
  const state = ENTITY_STATE_META[node.state];
  const reporters = reportersOf(index, node.id);
  const access = accessOf(index, node.id);
  const connections = connectionsOf(index, node.id);
  const steps = nextSteps(node);
  const aggregate = isAggregate(node);
  const facts = Object.entries(node.attributes).filter(([key]) => key !== "aggregate");
  const profile = node.source;

  return (
    <div>
      <header className="flex items-start gap-3 px-4 pt-4 pb-3.5">
        <GlyphIcon spec={specOf(node, role)} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{ENTITY_KIND_META[node.kind].label}</p>
          <h2 className="text-lg leading-tight font-bold wrap-anywhere text-ink">{node.label}</h2>
          {!aggregate && node.ref !== node.label ? <p className="mt-0.5 font-mono text-xs wrap-anywhere text-muted">{node.ref}</p> : null}
        </div>
        <button type="button" onClick={() => onSelect(null)} aria-label="Close the dossier" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="space-y-2 px-4 pb-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <Chip tone={state.tone}>{state.label}</Chip>
          <span>{state.description}</span>
        </p>
        {node.signals.map((signal) => (
          <p key={signal} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <Chip tone={SIGNAL_META[signal].tone}>{SIGNAL_META[signal].label}</Chip>
            <span>{SIGNAL_META[signal].description}</span>
          </p>
        ))}
      </div>

      {aggregate && members ? (
        <Section title="Grouped" aside={`${members.length} ${ENTITY_KIND_META[node.kind].plural.toLowerCase()}`}>
          <p className="mb-2 text-sm text-ink-2">Only one source touches these and none carries a signal, so they are drawn as one.</p>
          <ul className="max-h-44 space-y-0.5 overflow-y-auto font-mono text-xs text-ink-2">
            {members.map((member) => (
              <li key={member.id} className="truncate">
                {member.label}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onExpand(node.id)} className="mt-3 rounded-full bg-source-tint px-3 py-1.5 text-sm font-semibold text-source-ink hover:bg-fill">
            Show all {members.length} on the map
          </button>
        </Section>
      ) : null}

      {profile && isSource(node) ? (
        <Section title="Debrief" aside={`${profile.reportCount} reports`}>
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Fact term="Works for" value={profile.principalName} />
            <Fact term="Task" value={profile.task} />
            <Fact term="Harness" value={harnessLabel(profile.harness)} />
            <Fact term="Model" value={profile.model} />
            <Fact term="Runs on" value={profile.host ? `${profile.host} (${profile.runtime})` : profile.runtime === "unknown" ? null : profile.runtime} />
            <Fact term="Connected" value={formatWhen(profile.firstSeenAt)} />
            <Fact term="Last report" value={`${formatWhen(profile.lastSeenAt)} · ${formatAgo(profile.lastSeenAt, now)}`} />
          </dl>
        </Section>
      ) : null}

      {!aggregate && !isSource(node) && node.kind !== "person" ? (
        <Section title="Seen or used">
          <ul className="space-y-1 text-sm text-ink-2">
            <li>
              <span className="font-semibold text-ink">Used by {access.usedBy.length}</span>
              {access.usedBy.length > 0 ? `: ${names(access.usedBy)}` : ". Nobody reported using it."}
            </li>
            <li>
              <span className="font-semibold text-ink">Seen by {access.seenBy.length}</span>
              {access.seenBy.length > 0 ? `: ${names(access.seenBy)}` : "."}
            </li>
            {access.mentionedBy.length > 0 ? (
              <li>
                <span className="font-semibold text-ink">Mentioned by {access.mentionedBy.length}</span>: {names(access.mentionedBy)}. A mention does not corroborate.
              </li>
            ) : null}
          </ul>
          {access.bases.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Basis
              {access.bases.map((basis) => (
                <Chip key={basis} tone="neutral">
                  {BASIS_LABEL[basis]}
                </Chip>
              ))}
              {!access.bases.includes("accessed") && access.usedBy.length === 0 ? <span>Configured is not accessed.</span> : null}
            </p>
          ) : null}
        </Section>
      ) : null}

      {facts.length > 0 ? (
        <Section title="As reported">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            {facts.map(([key, value]) => (
              <Fact key={key} term={key.replaceAll("_", " ")} value={value} mono capitalize />
            ))}
          </dl>
        </Section>
      ) : null}

      {!isSource(node) ? (
        <Section title="Reported by" aside={`first seen ${formatWhen(node.firstSeenAt)}`}>
          {reporters.length === 0 ? (
            <p className="text-sm text-ink-2">{node.state === "reference" ? "Nobody has seen it. It was only mentioned." : "No reporter on record."}</p>
          ) : (
            <ul className="-mx-2">
              {reporters.map((reporter) => (
                <li key={reporter.agentId}>
                  {reporter.node ? (
                    <NodeButton
                      node={reporter.node}
                      index={index}
                      now={now}
                      onSelect={onSelect}
                      note={`${reporter.count} ${reporter.count === 1 ? "report" : "reports"} · ${formatWhen(reporter.firstAt)} to ${formatWhen(reporter.lastAt)}`}
                    />
                  ) : (
                    <span className="block px-2 py-1.5 text-sm text-ink-2">{reporter.label}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <Section title="Connections" aside={String(connections.length)}>
        {connections.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing reported yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {connections.map(({ edge, other, sentence, reporters: by }) => (
              <li key={edge.id} className="text-sm">
                <button type="button" onClick={() => onSelect(other.id)} className="text-left font-semibold text-ink hover:text-source-ink">
                  {sentence}
                </button>
                <p className="text-xs text-muted">
                  {edge.count} {edge.count === 1 ? "report" : "reports"} by {by.join(", ")} · last {formatAgo(edge.lastAt, now)}
                  {edge.bases.length > 0 ? ` · ${edge.bases.map((basis) => BASIS_LABEL[basis].toLowerCase()).join(", ")}` : ""}
                </p>
                {edge.recent[0] ? <p className="mt-1 border-l-2 border-rule pl-2 text-xs text-ink-2">{edge.recent[0]}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {steps.length > 0 ? (
        <Section title="What would move it on">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={step.id} className="flex gap-2.5 text-sm">
                <span className="figure mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-fill text-[11px] text-ink-2">{i + 1}</span>
                <span>
                  <span className="font-semibold text-ink">{step.title}.</span> <span className="text-ink-2">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {!aggregate ? (
        <div className="border-t border-rule p-4">
          <Link href={routes.entity(slug, node.id)} className="inline-flex items-center gap-1.5 rounded-full bg-source px-4 py-2 text-sm font-semibold text-on-source hover:bg-source-ink">
            Open full dossier
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ term, value, mono, capitalize }: { term: string; value: string | null; mono?: boolean; capitalize?: boolean }) {
  return (
    <>
      <dt className={cx("text-muted", capitalize ? "first-letter:uppercase" : undefined)}>{term}</dt>
      <dd className={cx("wrap-anywhere", value === null ? "text-muted italic" : "text-ink", mono && value !== null ? "font-mono text-xs leading-5" : undefined)}>{value ?? "Unknown"}</dd>
    </>
  );
}

interface BriefingProps {
  graph: MapGraph;
  index: MapIndex;
  counters: MapCounters;
  now: string;
  onSelect: (id: string) => void;
}

/** The panel with nothing focused: what needs a person, who is reporting, and what is not counted. */
export function Briefing({ graph, index, counters, now, onSelect }: BriefingProps) {
  const attention = attentionList(graph, index);
  const sources = graph.nodes.filter(isSource).sort((a, b) => (b.source?.lastSeenAt ?? "").localeCompare(a.source?.lastSeenAt ?? ""));
  const why = (node: MapNode) => {
    const signal = node.signals[0];
    const seen = node.reporterCount === 1 ? "seen by 1 source" : `seen by ${node.reporterCount} sources`;
    return `${signal ? SIGNAL_META[signal].label : ENTITY_KIND_META[node.kind].label} · ${seen}`;
  };
  return (
    <div>
      <header className="px-4 pt-4 pb-3">
        <h2 className="text-base font-bold text-ink">Needs a person</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          {attention.length === 0 ? "Nothing open. Every finding has been traced or dismissed." : "Seen from where a source runs, and not yet connected, traced or dismissed. Each is a lead, never a fact."}
        </p>
      </header>
      {attention.length > 0 ? (
        <ul className="px-2 pb-3">
          {attention.map((node) => (
            <li key={node.id}>
              <NodeButton node={node} index={index} now={now} onSelect={onSelect} note={why(node)} />
            </li>
          ))}
        </ul>
      ) : null}
      <Section title="Sources" aside={`${counters.sources} of ${counters.agentsSeen} agents seen`}>
        <ul className="-mx-2">
          {sources.map((node) => (
            <li key={node.id}>
              <NodeButton
                node={node}
                index={index}
                now={now}
                onSelect={onSelect}
                note={`${node.source?.principalName ?? "No principal"} · ${harnessLabel(node.source?.harness ?? "")} · ${formatAgo(node.source?.lastSeenAt ?? now, now)}`}
              />
            </li>
          ))}
        </ul>
        {counters.sources === 1 ? <p className="mt-2 text-sm text-ink-2">One source so far. Every source widens the picture.</p> : null}
      </Section>
      <Section title="Not counted">
        <p className="text-sm text-ink-2">
          {counters.references} {counters.references === 1 ? "reference" : "references"} mentioned but not seen
          {counters.dismissed > 0 ? `, ${counters.dismissed} dismissed` : ""}. The picture is what {counters.sources} {counters.sources === 1 ? "source" : "sources"} reported, not a complete inventory.
        </p>
      </Section>
    </div>
  );
}

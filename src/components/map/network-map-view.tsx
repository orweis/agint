"use client";

import { Check, Copy, Pause, Play, RotateCcw, Search, SlidersHorizontal, Table2, Waypoints } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import { ENTITY_KINDS, ENTITY_KIND_META, ENTITY_STATES, ENTITY_STATE_META, SIGNALS, SIGNAL_META } from "@/lib/domain";
import { layoutFree, layoutPicture } from "@/lib/map-layout";
import { LENSES, LENS_META, NO_FILTERS, activeFilterCount, applyFilters, applyLens, collapseLeaves, principals, searchMatches, type Lens, type MapFilters } from "@/lib/map-lens";
import { countMap, formatWhen, indexMap, type MapCounters } from "@/lib/map-model";
import { moments, replayAt } from "@/lib/map-replay";
import type { NetworkMap } from "@/lib/network-map";
import { routes } from "@/lib/routes";

import { Briefing, Dossier } from "./dossier";
import { GlyphIcon, type GlyphSpec } from "./glyph";
import { Legend } from "./legend";
import { MapCanvas } from "./map-canvas";
import { MapTable } from "./map-table";

const PLAY_MS = 900;

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** The agents map: counters, lenses, the picture, a dossier beside it and replay beneath. */
export function NetworkMapView({ map, slug }: { map: NetworkMap; slug: string }) {
  const [lens, setLens] = useState<Lens>("picture");
  const [principalId, setPrincipalId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Today's picture, with large maps' leaves grouped. Layout and roles come from this, so nothing jumps.
  const today = useMemo(() => {
    const collapsed = collapseLeaves(map, { expanded });
    const graph: NetworkMap = { ...map, nodes: collapsed.graph.nodes, edges: collapsed.graph.edges };
    return { graph, groups: collapsed.groups, index: indexMap(graph) };
  }, [map, expanded]);
  const timeline = useMemo(() => moments(today.graph), [today.graph]);
  const people = useMemo(() => principals(today.graph, today.index), [today]);
  const chosenPrincipal = principalId ?? people[0]?.id ?? null;

  const layout = useMemo(() => {
    const view = applyLens(today.graph, lens, { principalId: chosenPrincipal }, today.index);
    if (lens === "agents") {
      return layoutFree(
        view.nodes.map((node) => node.id),
        [...view.edges.map((edge) => ({ source: edge.source, target: edge.target })), ...view.overlaps.map((overlap) => ({ source: overlap.a, target: overlap.b }))],
      );
    }
    return layoutPicture(view, today.index.roles);
  }, [today, lens, chosenPrincipal]);

  const moment = step === null ? null : (timeline[Math.min(step, timeline.length - 1)] ?? null);
  const shown = useMemo(() => {
    const graph = moment === null ? today.graph : replayAt(today.graph, moment.at);
    const index = moment === null ? today.index : indexMap(graph);
    return { graph, index, counters: countMap(graph, index) };
  }, [today, moment]);
  const view = useMemo(
    () => applyFilters(applyLens(shown.graph, lens, { principalId: chosenPrincipal }, shown.index), filters),
    [shown, lens, chosenPrincipal, filters],
  );
  const matches = useMemo(() => searchMatches(view.nodes, query), [view.nodes, query]);
  const fresh = useMemo(() => new Set(moment === null ? [] : [...moment.nodeIds, ...moment.connectedIds, ...moment.corroboratedIds]), [moment]);
  const selected = selectedId === null ? null : (shown.index.byId.get(selectedId) ?? null);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((prev) => {
        const next = (prev ?? -1) + 1;
        if (next >= timeline.length - 1) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, PLAY_MS);
    return () => clearInterval(timer);
  }, [playing, timeline.length]);

  const select = (id: string | null) => {
    setSelectedId(id);
    // On a narrow screen the panel sits above the map: bring it into view when a node is picked there.
    if (id !== null && typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  };
  const play = () => {
    if (timeline.length === 0) return;
    if (step === null) setStep(0);
    setPlaying(true);
  };

  if (map.nodes.length === 0 || countMap(map).sources === 0) return <EmptyState slug={slug} seen={map.nodes.length} />;

  const present = {
    kinds: ENTITY_KINDS.filter((kind) => today.graph.nodes.some((node) => node.kind === kind)),
    signals: SIGNALS.filter((signal) => today.graph.nodes.some((node) => node.signals.includes(signal))),
  };
  const filterCount = activeFilterCount(filters);
  const dimmedBySearch = matches !== null;

  return (
    <section aria-label="Agents map" className="flex flex-col gap-3 text-ink">
      <CountersBar counters={shown.counters} replaying={moment !== null} onReplay={timeline.length > 1 ? () => { setStep(0); setPlaying(true); } : null} />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Lens" className="-mx-4 flex max-w-[100vw] gap-1 overflow-x-auto px-4 sm:mx-0 sm:rounded-full sm:border sm:border-rule sm:bg-panel sm:p-1">
          {LENSES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={lens === name}
              title={LENS_META[name].description}
              onClick={() => setLens(name)}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                lens === name ? "bg-source text-on-source" : "border border-rule bg-panel text-ink-2 hover:bg-fill sm:border-transparent sm:bg-transparent",
              )}
            >
              {LENS_META[name].label}
            </button>
          ))}
        </div>
        {lens === "principal" ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="sr-only">Principal</span>
            <select value={chosenPrincipal ?? ""} onChange={(event) => setPrincipalId(event.target.value)} className="h-9 rounded-full border border-rule bg-panel px-3 text-sm font-semibold text-ink">
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label} ({person.sources})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-64">
            <span className="sr-only">Search the map</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the map"
              className="h-9 w-full rounded-full border border-rule bg-panel pr-3 pl-9 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <ToolButton pressed={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} icon={<SlidersHorizontal className="size-4" aria-hidden />} expanded={filtersOpen}>
            Filters{filterCount > 0 ? ` (${filterCount})` : ""}
          </ToolButton>
          <ToolButton pressed={showTable} onClick={() => setShowTable((on) => !on)} icon={showTable ? <Waypoints className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}>
            {showTable ? "Map" : "Table"}
          </ToolButton>
        </div>
      </div>

      {filtersOpen ? (
        <div className="grid gap-x-8 gap-y-3 rounded-lg border border-rule bg-panel p-3.5 lg:grid-cols-[1.4fr_1fr_1fr]">
          <ChipGroup legend="Kind">
            {present.kinds.map((kind) => (
              <FilterChip key={kind} on={filters.kinds.includes(kind)} onClick={() => setFilters((prev) => ({ ...prev, kinds: toggle(prev.kinds, kind) }))}>
                {ENTITY_KIND_META[kind].plural}
              </FilterChip>
            ))}
          </ChipGroup>
          <ChipGroup legend="State">
            {ENTITY_STATES.map((state) => (
              <FilterChip key={state} on={filters.states.includes(state)} onClick={() => setFilters((prev) => ({ ...prev, states: toggle(prev.states, state) }))}>
                {ENTITY_STATE_META[state].label}
              </FilterChip>
            ))}
          </ChipGroup>
          <ChipGroup legend="Signal">
            {present.signals.length === 0 ? <span className="text-sm text-muted">No signals on this map.</span> : null}
            {present.signals.map((signal) => (
              <FilterChip key={signal} on={filters.signals.includes(signal)} onClick={() => setFilters((prev) => ({ ...prev, signals: toggle(prev.signals, signal) }))}>
                {SIGNAL_META[signal].label}
              </FilterChip>
            ))}
          </ChipGroup>
          {filterCount > 0 ? (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="link justify-self-start text-sm lg:col-span-3">
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <p role="status" className={cx("text-sm text-ink-2", dimmedBySearch || filterCount > 0 ? undefined : "sr-only")}>
        {dimmedBySearch ? `${matches.size} of ${view.nodes.length} match “${query.trim()}”. ` : ""}
        {filterCount > 0 ? `Showing ${view.nodes.length} nodes after filters. Counters describe the whole network.` : dimmedBySearch ? "" : `${LENS_META[lens].label}: ${view.nodes.length} nodes.`}
      </p>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside
          ref={panelRef}
          aria-label={selected ? `Dossier: ${selected.label}` : "Briefing"}
          className="scroll-mt-20 overflow-y-auto rounded-lg border border-rule bg-panel lg:order-2 lg:h-[calc(100dvh-15.5rem)] lg:min-h-[35rem]"
        >
          {selected ? (
            <Dossier
              node={selected}
              index={shown.index}
              now={map.generatedAt}
              slug={slug}
              onSelect={select}
              members={today.groups.get(selected.id) ?? null}
              onExpand={(id) => {
                setExpanded((prev) => new Set([...prev, id]));
                setSelectedId(null);
              }}
            />
          ) : (
            <Briefing graph={shown.graph} index={shown.index} counters={shown.counters} now={map.generatedAt} onSelect={select} />
          )}
        </aside>

        <div className="flex h-[27rem] flex-col overflow-hidden rounded-lg border border-rule bg-panel lg:order-1 lg:h-[calc(100dvh-15.5rem)] lg:min-h-[35rem]">
          <div className="relative min-h-0 flex-1">
            {showTable ? (
              <MapTable view={view} index={shown.index} selectedId={selectedId} onSelect={select} />
            ) : (
              <MapCanvas
                key={`${lens}:${chosenPrincipal ?? ""}:${expanded.size}`}
                layout={layout}
                view={view}
                index={shown.index}
                now={map.generatedAt}
                selectedId={selectedId}
                onSelect={select}
                matches={matches}
                fresh={fresh}
                pulseKey={moment?.at ?? "live"}
              >
                {view.nodes.length === 0 ? (
                  <p className="absolute inset-x-0 top-1/3 mx-auto w-fit max-w-xs rounded-lg border border-rule bg-panel px-4 py-3 text-center text-sm text-ink-2">Nothing in this view. Clear a filter or pick another lens.</p>
                ) : null}
              </MapCanvas>
            )}
          </div>
          {showTable ? null : <Legend />}
          {timeline.length > 1 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-rule px-3 py-2.5">
              <button
                type="button"
                onClick={() => (playing ? setPlaying(false) : play())}
                aria-label={playing ? "Pause replay" : "Play replay"}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-source text-on-source hover:bg-source-ink"
              >
                {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
              </button>
              <input
                type="range"
                aria-label="Replay: step through the moments the picture changed"
                aria-valuetext={moment ? `${formatWhen(moment.at)} UTC. ${moment.caption}` : "Now"}
                min={0}
                max={timeline.length - 1}
                value={step ?? timeline.length - 1}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPlaying(false);
                  setStep(next >= timeline.length - 1 ? null : next);
                }}
                className="h-1.5 min-w-32 flex-1 cursor-pointer accent-source sm:max-w-80"
              />
              <p className="min-w-0 flex-1 basis-56 truncate text-sm" aria-live="off">
                <span className="figure text-ink">{moment ? `${formatWhen(moment.at)} UTC` : "Now"}</span>
                <span className="ml-2 text-ink-2">{moment ? moment.caption : `as of ${formatWhen(map.generatedAt)} UTC`}</span>
              </p>
              {moment !== null ? (
                <button type="button" onClick={() => { setPlaying(false); setStep(null); }} className="rounded-full border border-rule px-3 py-1 text-sm font-semibold text-ink-2 hover:bg-fill">
                  Back to now
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ToolButton({ pressed, expanded, onClick, icon, children }: { pressed: boolean; expanded?: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={expanded === undefined ? pressed : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap", pressed ? "border-source bg-source-tint text-source-ink" : "border-rule bg-panel text-ink-2 hover:bg-fill")}
    >
      {icon}
      {children}
    </button>
  );
}

function ChipGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm", on ? "border-source bg-source-tint font-semibold text-source-ink" : "border-rule text-ink-2 hover:bg-fill")}
    >
      {on ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

const swatch = (over: Partial<GlyphSpec>): GlyphSpec => ({ kind: "agent", state: "lead", role: "sighting", flag: null, quiet: false, aggregate: false, ...over });

function CountersBar({ counters, replaying, onReplay }: { counters: MapCounters; replaying: boolean; onReplay: (() => void) | null }) {
  const notes = [
    `Built from ${counters.reports} ${counters.reports === 1 ? "report" : "reports"} by ${counters.sources} ${counters.sources === 1 ? "source" : "sources"}.`,
    counters.references > 0 ? `${counters.references} ${counters.references === 1 ? "reference" : "references"} mentioned, not counted.` : null,
    counters.quietSources > 0 ? `${counters.quietSources} ${counters.quietSources === 1 ? "source" : "sources"} quiet.` : null,
    "Not a complete inventory.",
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <dl className="flex flex-wrap gap-x-8 gap-y-2" aria-live={replaying ? "off" : undefined}>
        <Stat label="Sources" value={counters.sources} note={`of ${counters.agentsSeen} agents seen`} spec={swatch({ state: "source", role: "source" })} />
        <Stat label="Leads" value={counters.leads} note={`${counters.attention} need a person`} spec={swatch({})} />
        <Stat label="Corroborated" value={counters.corroborated} note="seen by two or more" spec={swatch({ state: "corroborated" })} />
        <Stat label="Mapped" value={counters.mapped} note={counters.traced > 0 ? `${counters.traced} traced` : "seen, not mentioned"} />
      </dl>
      <div className="flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
        <p className="min-w-0 flex-1 basis-72">{notes.join(" ")}</p>
        {onReplay ? (
          <button type="button" onClick={onReplay} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-rule bg-panel px-3.5 text-sm font-semibold text-ink-2 hover:bg-fill">
            <RotateCcw className="size-4" aria-hidden />
            Watch it grow
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, note, spec }: { label: string; value: number; note: string; spec?: GlyphSpec }) {
  return (
    <div className="flex flex-col-reverse">
      <dd className="flex items-baseline gap-2">
        <span className="figure text-3xl leading-none text-ink">{value}</span>
        <span className="text-xs text-muted">{note}</span>
      </dd>
      <dt className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {spec ? <GlyphIcon spec={spec} size={16} /> : null}
        {label}
      </dt>
    </div>
  );
}

const noop = () => () => {};

/** No sources yet: the one sentence that starts a network. */
function EmptyState({ slug, seen }: { slug: string; seen: number }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const sentence = `Connect to the AGINT MCP at ${origin}${routes.mcp()} and report as you work.`;
  return (
    <section aria-label="Agents map" className="mx-auto max-w-2xl rounded-lg border border-rule bg-panel p-6 sm:p-10">
      <div className="mb-5 flex items-center gap-3">
        <GlyphIcon spec={swatch({ state: "source", role: "source" })} size={40} />
        <GlyphIcon spec={swatch({ kind: "mcp_server" })} size={34} />
        <GlyphIcon spec={swatch({ state: "reference" })} size={34} />
      </div>
      <h2 className="text-2xl font-bold text-ink">No sources yet</h2>
      <p className="mt-2 text-ink-2">The map starts with one agent. Nothing to install: tell any agent this, and it becomes your first source.</p>
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-rule bg-fill p-4">
        <p className="min-w-0 flex-1 font-mono text-sm wrap-anywhere text-ink">{sentence}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(sentence).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-source px-3.5 py-1.5 text-sm font-semibold text-on-source hover:bg-source-ink"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <ol className="mt-6 space-y-2 text-sm text-ink-2">
        <li>
          <span className="font-semibold text-ink">It debriefs.</span> Who it works for, its task, and every tool, server, repository and credential it touches.
        </li>
        <li>
          <span className="font-semibold text-ink">It reports what else it can see.</span> Keys not issued to it, other agents on its machine, servers nobody approved. Each arrives as a lead, never a fact.
        </li>
        <li>
          <span className="font-semibold text-ink">The picture compounds.</span> A second source corroborates what the first saw, and widens the map with its own view.
        </li>
      </ol>
      {seen > 0 ? <p className="mt-4 text-sm text-muted">{seen} things have been reported, but no agent has connected as a source yet.</p> : null}
      <p className="mt-6 text-sm">
        <Link href={routes.connect(slug)} className="link">
          Other ways to connect
        </Link>
      </p>
    </section>
  );
}

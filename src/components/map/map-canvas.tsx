"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { cx } from "@/lib/cx";
import { ENTITY_KIND_META, RELATION_META } from "@/lib/domain";
import { edgeGeometry, glyphRadius, nearestInDirection, type Direction, type LayoutNode, type MapLayout } from "@/lib/map-layout";
import type { LensView } from "@/lib/map-lens";
import { edgeClass, isSource, neighborhood, nodeAriaLabel, nodeSubtitle, roleOf, type EdgeClass, type MapIndex } from "@/lib/map-model";
import type { MapNode } from "@/lib/network-map";

import { Glyph, specOf } from "./glyph";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EDGE_PAINT: Record<EdgeClass, { stroke: string; width: number; dash?: string; opacity: number; marker?: string }> = {
  context: { stroke: "var(--faint)", width: 1.25, opacity: 0.9 },
  reach: { stroke: "var(--edge)", width: 1.25, opacity: 0.55 },
  sighting: { stroke: "var(--lead)", width: 1.75, dash: "6 4", opacity: 0.95, marker: "lead" },
  agent: { stroke: "var(--source)", width: 2, opacity: 0.9, marker: "source" },
  mention: { stroke: "var(--muted)", width: 1.25, dash: "1.5 4", opacity: 0.8, marker: "mention" },
};

const HEADER_TEXT: Record<"reach" | "sources" | "seen", { title: string; note: string }> = {
  reach: { title: "Reach", note: "what they use" },
  sources: { title: "Sources", note: "who works for whom" },
  seen: { title: "Seen, not connected", note: "what they noticed" },
};

const ARROWS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const HALO = { paintOrder: "stroke" as const, stroke: "var(--canvas)", strokeWidth: 4, strokeLinejoin: "round" as const };

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function subtitleOf(node: MapNode, now: string): string {
  const base = nodeSubtitle(node, now);
  if (node.state === "corroborated") return `${base} · ${node.reporterCount} sources`;
  if (node.state === "traced") return `${base} · traced`;
  if (node.state === "dismissed") return `${base} · dismissed`;
  return base;
}

function zoomBox(from: ViewBox, base: ViewBox, factor: number, centre?: { x: number; y: number }): ViewBox {
  const w = Math.min(base.w * 1.6, Math.max(base.w * 0.15, from.w / factor));
  const scale = w / from.w;
  const cx0 = centre?.x ?? from.x + from.w / 2;
  const cy0 = centre?.y ?? from.y + from.h / 2;
  return { x: cx0 - (cx0 - from.x) * scale, y: cy0 - (cy0 - from.y) * scale, w, h: from.h * scale };
}

function toMap(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } | undefined {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return undefined;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

interface CanvasProps {
  layout: MapLayout;
  view: LensView;
  /** Index of the map as shown (at the replay moment), for roles and edge classes. */
  index: MapIndex;
  now: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Search matches; null when there is no search. */
  matches: ReadonlySet<string> | null;
  /** Nodes that arrived or changed at the current replay moment. */
  fresh: ReadonlySet<string>;
  /** Changes when the pulse should replay. */
  pulseKey: string;
  children?: React.ReactNode;
}

export function MapCanvas({ layout, view, index, now, selectedId, onSelect, matches, fresh, pulseKey, children }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<{ pointer: number; x: number; y: number; from: ViewBox; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [box, setBox] = useState<ViewBox | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [roving, setRoving] = useState<string | null>(null);

  const base = useMemo<ViewBox>(() => {
    // Never magnify a small graph past life size: pad it out to a minimum frame instead.
    const pad = 28;
    const { minX, minY, maxX, maxY } = layout.bounds;
    const w = Math.max(maxX - minX + pad * 2, 980);
    const h = Math.max(maxY - minY + pad * 2, 520);
    return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
  }, [layout]);
  const current = box ?? base;

  const placed = useMemo(() => view.nodes.filter((node) => layout.nodes.has(node.id)), [view.nodes, layout]);
  const visibleIds = useMemo(() => new Set(placed.map((node) => node.id)), [placed]);
  const focusId = selectedId !== null && visibleIds.has(selectedId) ? selectedId : hoverId !== null && visibleIds.has(hoverId) ? hoverId : null;
  const hood = useMemo(() => (focusId === null ? null : neighborhood(index, focusId)), [index, focusId]);
  const rovingId = roving !== null && visibleIds.has(roving) ? roving : selectedId !== null && visibleIds.has(selectedId) ? selectedId : (placed.find(isSource)?.id ?? placed[0]?.id ?? null);

  const zoom = (factor: number, centre?: { x: number; y: number }) => setBox((prev) => zoomBox(prev ?? base, base, factor, centre));

  // Ctrl or Cmd + scroll (and trackpad pinch) zooms; plain scroll is left to the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const centre = toMap(svg, event.clientX, event.clientY);
      setBox((prev) => zoomBox(prev ?? base, base, Math.exp(-event.deltaY * 0.01), centre));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [base]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, from: current, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    const svg = svgRef.current;
    if (!state || !svg || state.pointer !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      state.moved = true;
      svg.setPointerCapture(event.pointerId);
    }
    const rect = svg.getBoundingClientRect();
    const scale = Math.max(state.from.w / rect.width, state.from.h / rect.height);
    setBox({ ...state.from, x: state.from.x - dx * scale, y: state.from.y - dy * scale });
  };
  const onPointerEnd = () => {
    if (drag.current?.moved) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    drag.current = null;
  };

  const reveal = (id: string) => {
    const at = layout.nodes.get(id);
    if (!at) return;
    setBox((prev) => {
      const from = prev ?? base;
      const margin = 60;
      const inside = at.x > from.x + margin && at.x < from.x + from.w - margin && at.y > from.y + margin && at.y < from.y + from.h - margin;
      return inside ? prev : { ...from, x: at.x - from.w / 2, y: at.y - from.h / 2 };
    });
  };

  const onNodeKey = (event: KeyboardEvent<SVGGElement>, id: string) => {
    const direction = ARROWS[event.key];
    if (direction) {
      event.preventDefault();
      const next = nearestInDirection(layout, id, direction, visibleIds);
      if (next !== null) {
        setRoving(next);
        reveal(next);
        nodeRefs.current.get(next)?.focus();
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  };

  const onCanvasKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "+" || event.key === "=") zoom(1.3);
    else if (event.key === "-") zoom(1 / 1.3);
    else if (event.key === "0") setBox(null);
  };

  const dimmed = (id: string) => (hood !== null ? !hood.nodeIds.has(id) : matches !== null && !matches.has(id));
  const radius = (node: MapNode) => glyphRadius(node.kind, isSource(node));
  const slotCount = (slots: readonly LayoutNode["slot"][]) => placed.filter((node) => slots.includes(layout.nodes.get(node.id)!.slot)).length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <svg
        ref={svgRef}
        role="group"
        aria-label={`Agents map: ${placed.length} nodes and ${view.edges.length + view.overlaps.length} connections. Arrow keys move between nodes, Enter opens one. The table view lists everything.`}
        viewBox={`${current.x} ${current.y} ${current.w} ${current.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full cursor-grab touch-pan-y select-none active:cursor-grabbing lg:touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onCanvasKey}
        onDoubleClick={(event) => zoom(1.6, toMap(svgRef.current, event.clientX, event.clientY))}
        onClick={() => {
          if (!suppressClick.current) onSelect(null);
        }}
      >
        <style>{`
          @keyframes agint-ping { from { transform: scale(1); opacity: .75 } to { transform: scale(2.6); opacity: 0 } }
          .agint-ping { transform-box: fill-box; transform-origin: center; animation: agint-ping 1s ease-out both }
          @keyframes agint-in { from { opacity: 0 } }
          .agint-in { animation: agint-in .45s ease-out }
          .agint-node, .agint-edge { transition: opacity .18s ease-out }
        `}</style>
        <defs>
          <pattern id="agint-grid" width={28} height={28} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--canvas-grid)" />
          </pattern>
          {(
            [
              ["lead", "var(--lead)"],
              ["source", "var(--source)"],
              ["mention", "var(--muted)"],
            ] as const
          ).map(([name, colour]) => (
            <marker key={name} id={`agint-arrow-${name}`} viewBox="0 0 10 10" refX={8.5} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M1,1.5 L9,5 L1,8.5" fill="none" stroke={colour} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
        </defs>
        <rect x={current.x - current.w} y={current.y - current.h} width={current.w * 3} height={current.h * 3} fill="url(#agint-grid)" />

        {layout.headers.map((header) => {
          const count = header.key === "reach" ? slotCount(["reach"]) : header.key === "seen" ? slotCount(["seen"]) : placed.filter(isSource).length;
          return (
            <g key={header.key} transform={`translate(${header.x},${header.y})`} textAnchor={header.anchor} aria-hidden>
              <text fontSize={12} fontWeight={600} letterSpacing="0.09em" fill="var(--ink-2)" {...HALO}>
                {HEADER_TEXT[header.key].title.toUpperCase()}
                <tspan fill="var(--muted)" fontWeight={400}>{`  ${count}`}</tspan>
              </text>
              <text y={16} fontSize={11.5} fill="var(--muted)" {...HALO}>
                {HEADER_TEXT[header.key].note}
              </text>
            </g>
          );
        })}

        <g aria-hidden>
          {view.overlaps.map((overlap) => {
            const a = layout.nodes.get(overlap.a);
            const b = layout.nodes.get(overlap.b);
            if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const nx = (-(b.y - a.y) / length) * 34;
            const ny = ((b.x - a.x) / length) * 34;
            const off = hood !== null ? !(hood.nodeIds.has(a.id) && hood.nodeIds.has(b.id) && (focusId === a.id || focusId === b.id)) : matches !== null && !(matches.has(a.id) && matches.has(b.id));
            const first = index.byId.get(overlap.via[0] ?? "")?.label ?? "";
            const label = overlap.via.length > 1 ? `share ${clip(first, 16)} +${overlap.via.length - 1}` : `share ${clip(first, 20)}`;
            return (
              <g key={overlap.id} className="agint-edge" opacity={off ? 0.08 : 1}>
                <path d={`M${a.x},${a.y} Q${mx + nx * 2},${my + ny * 2} ${b.x},${b.y}`} fill="none" stroke="var(--source)" strokeWidth={1.5} strokeDasharray="1.5 5" strokeLinecap="round" opacity={0.75} />
                <text x={mx + nx} y={my + ny + 3.5} textAnchor="middle" fontSize={10.5} fill="var(--source-ink)" {...HALO}>
                  {label}
                </text>
              </g>
            );
          })}
          {view.edges.map((edge) => {
            const from = layout.nodes.get(edge.source);
            const to = layout.nodes.get(edge.target);
            const fromNode = index.byId.get(edge.source);
            const toNode = index.byId.get(edge.target);
            if (!from || !to || !fromNode || !toNode || !visibleIds.has(from.id) || !visibleIds.has(to.id)) return null;
            const cls = edgeClass(edge, index);
            const paint = EDGE_PAINT[cls];
            const geometry = edgeGeometry(from, to, radius(fromNode) + 2, radius(toNode) + 2);
            const lit = hood !== null && hood.edgeIds.has(edge.id);
            const off = hood !== null ? !lit : matches !== null && !(matches.has(from.id) && matches.has(to.id));
            const heavy = edge.reporterIds.length > 1 ? 1 : 0;
            return (
              <g key={edge.id} className={cx("agint-edge", fresh.has(edge.source) || fresh.has(edge.target) ? "agint-in" : undefined)} opacity={off ? 0.07 : lit ? 1 : paint.opacity}>
                <path
                  d={geometry.d}
                  fill="none"
                  stroke={paint.stroke}
                  strokeWidth={paint.width + heavy + (lit ? 0.5 : 0)}
                  strokeDasharray={paint.dash}
                  strokeLinecap="round"
                  markerEnd={paint.marker ? `url(#agint-arrow-${paint.marker})` : undefined}
                />
                {lit ? (
                  <text x={geometry.mid.x} y={geometry.mid.y + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink-2)" {...HALO}>
                    {RELATION_META[edge.relation].phrase}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {placed.map((node) => {
          const at = layout.nodes.get(node.id)!;
          const role = roleOf(index, node.id);
          const spec = specOf(node, role);
          const r = radius(node);
          const selected = node.id === selectedId;
          const side = at.slot === "reach" ? "left" : at.slot === "seen" || at.slot === "person" ? "right" : "below";
          const muted = node.state === "reference" || node.state === "dismissed";
          const name = clip(node.label, side === "below" ? 26 : 24);
          const sub = at.slot === "person" ? null : subtitleOf(node, now);
          const tx = side === "left" ? -(r + 11) : side === "right" ? r + 11 : 0;
          const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
          const nameY = side === "below" ? r + 18 : sub === null ? 4.5 : -2.5;
          return (
            <g
              key={node.id}
              ref={(element) => {
                if (element) nodeRefs.current.set(node.id, element);
                else nodeRefs.current.delete(node.id);
              }}
              transform={`translate(${at.x},${at.y})`}
              role="button"
              tabIndex={node.id === rovingId ? 0 : -1}
              aria-label={nodeAriaLabel(node)}
              aria-pressed={selected}
              data-node={node.id}
              data-state={node.state}
              data-kind={node.kind}
              className={cx("agint-node group cursor-pointer outline-none", fresh.has(node.id) ? "agint-in" : undefined)}
              opacity={dimmed(node.id) ? 0.16 : 1}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressClick.current) return;
                setRoving(node.id);
                onSelect(node.id);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => onNodeKey(event, node.id)}
              onFocus={() => setRoving(node.id)}
              onPointerEnter={() => setHoverId(node.id)}
              onPointerLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
            >
              <title>{`${node.label} · ${ENTITY_KIND_META[node.kind].label}`}</title>
              {/* A generous, invisible target so small glyphs and their labels are easy to hit. */}
              <rect
                x={side === "left" ? -(r + 150) : side === "below" ? -70 : -(r + 6)}
                y={-(r + 6)}
                width={side === "below" ? 140 : r * 2 + 156}
                height={side === "below" ? r * 2 + 44 : r * 2 + 12}
                fill="transparent"
              />
              {fresh.has(node.id) ? <circle key={pulseKey} r={r + 2} fill="none" stroke={role === "source" ? "var(--source)" : "var(--lead)"} strokeWidth={2} className="agint-ping" /> : null}
              <circle r={r + 7} fill="none" stroke="var(--ink)" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
              {selected ? <circle r={r + 7} fill="var(--source-tint)" stroke="var(--source)" strokeWidth={2} /> : null}
              <Glyph spec={spec} />
              <text
                x={tx}
                y={nameY}
                textAnchor={anchor}
                fontSize={at.slot === "source" ? 14 : 13}
                fontWeight={600}
                fontStyle={node.state === "reference" ? "italic" : undefined}
                textDecoration={node.state === "dismissed" ? "line-through" : undefined}
                fill={muted ? "var(--muted)" : "var(--ink)"}
                {...HALO}
              >
                {name}
              </text>
              {sub !== null ? (
                <text x={tx} y={nameY + 14} textAnchor={anchor} fontSize={11} fill="var(--muted)" {...HALO}>
                  {clip(sub, 30)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-rule bg-panel shadow-sm">
        {(
          [
            ["Zoom in", Plus, () => zoom(1.35)],
            ["Zoom out", Minus, () => zoom(1 / 1.35)],
            ["Fit the whole picture", Maximize, () => setBox(null)],
          ] as const
        ).map(([label, Icon, run]) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={run} className="grid size-9 place-items-center text-ink-2 hover:bg-fill hover:text-ink [&+&]:border-t [&+&]:border-rule">
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

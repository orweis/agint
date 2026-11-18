"use client";

import { cx } from "@/lib/cx";
import type { LensView } from "@/lib/map-lens";
import { edgeRows, nodeRows, type MapIndex } from "@/lib/map-model";

const TH = "sticky top-0 bg-panel px-3 py-2 text-left text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase";
const TD = "border-t border-rule px-3 py-2 align-top";

/** The map as text: every node and every edge in the current view, for screen readers and for copying. */
export function MapTable({ view, index, selectedId, onSelect }: { view: LensView; index: MapIndex; selectedId: string | null; onSelect: (id: string) => void }) {
  const nodes = nodeRows(view);
  const edges = edgeRows(view, index);
  return (
    <div className="h-full overflow-auto bg-panel text-sm">
      <table className="w-full border-collapse">
        <caption className="px-3 pt-3 pb-2 text-left text-base font-bold text-ink">
          Nodes <span className="font-normal text-muted">{nodes.length}</span>
        </caption>
        <thead>
          <tr>
            {["Name", "Kind", "State", "Signals", "Seen by", "First seen", "Last seen"].map((heading) => (
              <th key={heading} scope="col" className={TH}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((row) => (
            <tr key={row.id} aria-current={row.id === selectedId ? "true" : undefined} className={cx(row.id === selectedId ? "bg-source-tint" : undefined)}>
              <th scope="row" className={cx(TD, "max-w-64 text-left font-semibold")}>
                <button type="button" onClick={() => onSelect(row.id)} className="link text-left wrap-anywhere">
                  {row.label}
                </button>
              </th>
              <td className={TD}>{row.kind}</td>
              <td className={TD}>{row.state}</td>
              <td className={TD}>{row.signals || <span className="text-muted">None</span>}</td>
              <td className={cx(TD, "tabular-nums")}>{row.reporters}</td>
              <td className={cx(TD, "whitespace-nowrap tabular-nums")}>{row.firstSeen}</td>
              <td className={cx(TD, "whitespace-nowrap tabular-nums")}>{row.lastSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mt-4 w-full border-collapse">
        <caption className="px-3 pt-3 pb-2 text-left text-base font-bold text-ink">
          Connections <span className="font-normal text-muted">{edges.length + view.overlaps.length}</span>
        </caption>
        <thead>
          <tr>
            {["Connection", "Reported by", "Reports", "First", "Last"].map((heading) => (
              <th key={heading} scope="col" className={TH}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {edges.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={cx(TD, "text-left font-normal wrap-anywhere")}>
                {row.sentence}
              </th>
              <td className={TD}>{row.reporters}</td>
              <td className={cx(TD, "tabular-nums")}>{row.count}</td>
              <td className={cx(TD, "whitespace-nowrap tabular-nums")}>{row.first}</td>
              <td className={cx(TD, "whitespace-nowrap tabular-nums")}>{row.last}</td>
            </tr>
          ))}
          {view.overlaps.map((overlap) => (
            <tr key={overlap.id}>
              <th scope="row" className={cx(TD, "text-left font-normal wrap-anywhere")}>
                {index.byId.get(overlap.a)?.label} and {index.byId.get(overlap.b)?.label} share {overlap.via.map((id) => index.byId.get(id)?.label ?? id).join(", ")}
              </th>
              <td className={cx(TD, "text-muted")} colSpan={4}>
                Derived from what each reported
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";

import { cx } from "@/lib/cx";

export interface FilterOption {
  label: string;
  href: string;
  current: boolean;
  count?: number;
}

/** A row of link capsules that filter a page through its query string. */
export function FilterCapsules({ label, options }: { label: string; options: FilterOption[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1.5 pb-1">
        <li className="flex items-center pr-1 text-xs font-semibold text-muted">{label}</li>
        {options.map((option) => (
          <li key={option.href}>
            <Link
              href={option.href}
              scroll={false}
              aria-current={option.current ? "true" : undefined}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                option.current ? "border-source/40 bg-source-tint text-source-ink" : "border-rule bg-panel text-ink-2 hover:bg-fill",
              )}
            >
              {option.label}
              {option.count !== undefined && <span className="figure text-xs text-muted">{option.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

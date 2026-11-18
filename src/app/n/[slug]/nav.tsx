"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";

export function NetworkNav({ slug, counts }: { slug: string; counts: { sources: number; leads: number } }) {
  const pathname = usePathname();
  const tabs = [
    { href: routes.network(slug), label: "Map", exact: true },
    { href: routes.sources(slug), label: "Sources", count: counts.sources },
    { href: routes.leads(slug), label: "Leads", count: counts.leads, hot: true },
    { href: routes.activity(slug), label: "Debriefs" },
    { href: routes.connect(slug), label: "Connect" },
  ];
  return (
    <nav aria-label="Network" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const current = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
                  current ? "bg-source-tint text-source-ink" : "text-ink-2 hover:bg-fill",
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cx("figure rounded-full px-1.5 text-xs", tab.hot ? "bg-lead text-ink" : "bg-fill text-muted")}>{tab.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

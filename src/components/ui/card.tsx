import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export function Card({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={cx("rounded-lg border border-rule bg-panel", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, id, description, actions }: { title: string; id?: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

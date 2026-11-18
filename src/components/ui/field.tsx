import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("h-10 w-full rounded-full border border-rule bg-panel px-4 text-sm text-ink placeholder:text-faint focus:border-source focus:outline-none", className)} {...rest} />;
}

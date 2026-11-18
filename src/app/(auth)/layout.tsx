import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { routes } from "@/lib/routes";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <Link href={routes.home()} className="mb-8 self-center">
        <Logo />
      </Link>
      <div className="rounded-lg border border-rule bg-panel p-6">{children}</div>
    </main>
  );
}

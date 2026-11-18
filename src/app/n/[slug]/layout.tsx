import Link from "next/link";

import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { openFindings } from "@/lib/network-map";
import { routes } from "@/lib/routes";
import { requireNetwork } from "@/server/auth/session";
import { countsOf, getNetworkMap } from "@/server/domain/map";

import { NetworkNav } from "./nav";

export default async function NetworkLayout({ children, params }: LayoutProps<"/n/[slug]">) {
  const { slug } = await params;
  const { ctx, viewer } = await requireNetwork(slug);
  const map = await getNetworkMap(ctx, {});
  const counts = countsOf(map);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href={routes.networks()} className="flex items-center gap-3">
            <Logo />
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-rule sm:block" />
          <span className="font-semibold text-ink">{ctx.tenant.name}</span>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <NetworkNav slug={slug} counts={{ sources: counts.sources, leads: openFindings(map).length }} />
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted">
            <span className="hidden lg:inline">{viewer.user.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

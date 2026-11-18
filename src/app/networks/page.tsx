import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardHeader } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { getViewer } from "@/server/auth/session";

import { CreateNetworkForm } from "./create-network-form";

export const metadata: Metadata = { title: "Networks" };

export default async function NetworksPage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href={routes.home()}>
          <Logo />
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:inline">{viewer.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <h1 className="mb-6 text-2xl font-bold text-ink">Your networks</h1>
      {viewer.memberships.length > 0 && (
        <ul className="mb-8 divide-y divide-rule rounded-lg border border-rule bg-panel">
          {viewer.memberships.map(({ tenant, role }) => (
            <li key={tenant.id}>
              <Link href={routes.network(tenant.slug)} className="flex items-center justify-between px-5 py-4 hover:bg-fill">
                <span className="font-semibold text-ink">{tenant.name}</span>
                <span className="text-sm text-muted capitalize">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card labelledBy="new-network">
        <CardHeader id="new-network" title="New network" description="One network per team or pilot. You'll get an intake key to hand to your agents." />
        <div className="p-5">
          <CreateNetworkForm />
        </div>
      </Card>
    </div>
  );
}

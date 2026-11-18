import type { Metadata } from "next";

import { NetworkMapView } from "@/components/map/network-map-view";
import { emptyMap, northstarMap } from "@/lib/fixtures/northstar-map";

export const metadata: Metadata = { title: "Map preview" };

/** The demo map on synthetic data, with no sign-in, laid out like the network page. `?empty` shows the empty state. */
export default async function MapPreviewPage({ searchParams }: PageProps<"/preview/map">) {
  const params = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-x-4 px-4 py-3.5">
          <span className="font-bold tracking-tight text-ink">AGINT</span>
          <span aria-hidden className="h-5 w-px bg-rule" />
          <span className="font-semibold text-ink">Northstar</span>
          <span className="ml-auto rounded-full bg-fill px-2.5 py-0.5 text-xs font-semibold text-ink-2">Preview · synthetic data</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        <h1 className="sr-only">Northstar: the agents map</h1>
        <NetworkMapView map={params.empty === undefined ? northstarMap : emptyMap} slug="northstar" />
      </main>
    </div>
  );
}

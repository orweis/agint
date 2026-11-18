import type { Metadata } from "next";

import { NetworkMapView } from "@/components/map/network-map-view";
import { requireNetwork } from "@/server/auth/session";
import { getNetworkMap } from "@/server/domain/map";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage({ params }: PageProps<"/n/[slug]">) {
  const { slug } = await params;
  const { ctx } = await requireNetwork(slug);
  const map = await getNetworkMap(ctx, {});
  return (
    <>
      <h1 className="sr-only">{ctx.tenant.name}: the agents map</h1>
      <NetworkMapView map={map} slug={slug} />
    </>
  );
}

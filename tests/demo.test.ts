import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedNorthstarStory } from "@/server/demo/northstar";
import { attentionList } from "@/lib/map-model";
import { openFindings } from "@/lib/network-map";
import { buildNetworkMap, countsOf } from "@/server/domain/map";

import { createTestDb, seedNetwork, type TestDb } from "./support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

describe("the Northstar demo story", () => {
  it("tells the deck's story: sources, leads, a connected lead, corroboration, a shadow server", async () => {
    const net = await seedNetwork(t.db);
    await seedNorthstarStory(net.human, net.key.ctx);
    const map = await buildNetworkMap(net.human);
    const node = (label: string) => map.nodes.find((candidate) => candidate.label === label);
    expect(countsOf(map).sources).toBe(4);
    expect(node("maya-cursor")?.state).toBe("source");
    expect(node("notes-sync")).toMatchObject({ state: "corroborated", signals: ["shadow_mcp"] });
    expect(node("github")?.state).toBe("traced");
    expect(node("billing-helper")).toMatchObject({ state: "corroborated", signals: ["unknown_agent"] });
    expect(node("deploy-helper")?.state).toBe("reference");
    expect(node("OPENAI_API_KEY")?.signals).toContain("unissued_credential");
    expect(node("data-analyst")?.signals).toContain("stale_source");
    expect(node("release-assistant")?.signals).toContain("privileged_reach");
    // The queue a person triages is what was sighted, not every tool a source used.
    expect(openFindings(map).map((n) => n.label).sort()).toEqual(["OPENAI_API_KEY", "billing-helper", "notes-sync", "s3://northstar-crm-exports"]);
    // The nav badge, the Leads queue and the map's "Needs a person" agree.
    expect(attentionList(map).map((n) => n.label).sort()).toEqual(openFindings(map).map((n) => n.label).sort());
    expect(map.since && map.since < new Date(Date.now() - 60 * 3_600_000).toISOString()).toBe(true);
  });
});

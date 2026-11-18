import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { checkIn, checkOut, reportActivity, reportSightings, setTask } from "@/server/domain/intake";
import { dismissEntity, reopenEntity, traceEntity } from "@/server/domain/decisions";
import { buildNetworkMap, countsOf, getDossier, listEvents, listSources } from "@/server/domain/map";
import { revokeKey } from "@/server/domain/keys";
import { authenticateIntakeKey } from "@/server/domain/keys";

import { createTestDb, intakeKey, seedNetwork, type Network, type TestDb } from "./support/db";

let t: TestDb;
let net: Network;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());
beforeEach(async () => {
  net = await seedNetwork(t.db);
});

const release = {
  name: "release-assistant",
  harness: "claude-code",
  runtime: "laptop" as const,
  host: "maya-mbp",
  principal: { name: "Maya Chen", email: "maya@northstar.dev" },
  task: "Review PR #482",
  repositories: ["https://github.com/northstar/web.git"],
  mcpServers: [{ name: "github" }],
  credentials: [{ name: "GITHUB_TOKEN", location: "keychain" }],
};

describe("check_in", () => {
  it("enrols a source and is idempotent for the same name, harness and host", async () => {
    const first = await checkIn(net.key.ctx, release);
    expect(first.status).toBe("new");
    const again = await checkIn(net.key.ctx, { ...release, task: "Review PR #483" });
    expect(again).toMatchObject({ agentId: first.agentId, status: "returning" });
    const sources = await listSources(net.human, {});
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ name: "release-assistant", task: "Review PR #483", principalName: "Maya Chen" });
  });

  it("maps the principal, host, repo, MCP server and held credential around the source", async () => {
    await checkIn(net.key.ctx, release);
    const map = await buildNetworkMap(net.human);
    const labels = map.nodes.map((node) => `${node.kind}:${node.label}`).sort();
    expect(labels).toEqual(["agent:release-assistant", "credential:GITHUB_TOKEN", "host:maya-mbp", "mcp_server:github", "person:Maya Chen", "repository:github.com/northstar/web"]);
    expect(map.edges.map((edge) => edge.relation).sort()).toEqual(["holds", "reads", "runs_on", "uses", "works_for"]);
  });

  it("withholds secrets an agent sends by mistake", async () => {
    const out = await checkIn(net.key.ctx, { ...release, task: `deploy with OPENAI_API_KEY=${"sk-" + "proj-"}abcdefghijklmnopqrstuvwx1234` });
    expect(out.withheld).toBe(1);
    const [source] = await listSources(net.human, {});
    expect(source?.task).toBe("deploy with OPENAI_API_KEY=[withheld]");
    expect(JSON.stringify(await listEvents(net.human, {}))).not.toContain("sk-proj");
  });
});

describe("leads", () => {
  it("a sighting is a lead; a second independent source corroborates it", async () => {
    const a = await checkIn(net.key.ctx, release);
    const b = await checkIn(net.key.ctx, { name: "support-summarizer", harness: "cursor", host: "liam-xps", principal: { name: "Liam Patel" } });
    const first = await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "mcp_server", name: "notes-sync" }, basis: "configured" }] });
    expect(first.leads).toEqual([{ name: "notes-sync", kind: "mcp_server", state: "lead" }]);
    // The same reporter again is not independent.
    await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "mcp_server", name: "Notes-Sync" }, basis: "running" }] });
    let map = await buildNetworkMap(net.human);
    expect(map.nodes.find((node) => node.label === "notes-sync")).toMatchObject({ state: "lead", reporterCount: 1, signals: ["shadow_mcp"] });
    const second = await reportSightings(net.key.ctx, { agentId: b.agentId, sightings: [{ target: { kind: "mcp_server", name: "notes-sync" }, basis: "configured" }] });
    expect(second.leads[0]?.state).toBe("corroborated");
    map = await buildNetworkMap(net.human);
    expect(map.nodes.find((node) => node.label === "notes-sync")?.reporterCount).toBe(2);
    expect((await listEvents(net.human, { kind: "corroborated" })).map((e) => e.summary)).toEqual([expect.stringContaining("notes-sync")]);
  });

  it("a mention is a reference until someone sees it", async () => {
    const a = await checkIn(net.key.ctx, release);
    const b = await checkIn(net.key.ctx, { name: "support-summarizer", harness: "cursor" });
    await reportSightings(net.key.ctx, { agentId: b.agentId, sightings: [{ target: { kind: "agent", name: "billing-helper" }, basis: "mentioned" }] });
    let map = await buildNetworkMap(net.human);
    expect(map.nodes.find((node) => node.label === "billing-helper")?.state).toBe("reference");
    expect(countsOf(map).references).toBe(1);
    await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "agent", name: "billing-helper" }, basis: "running", sharesJob: true }] });
    map = await buildNetworkMap(net.human);
    expect(map.nodes.find((node) => node.label === "billing-helper")).toMatchObject({ state: "lead", signals: ["unknown_agent"] });
    expect(map.edges.some((edge) => edge.relation === "shares_job")).toBe(true);
  });

  it("an unissued key is reported by existence and flagged", async () => {
    const a = await checkIn(net.key.ctx, release);
    await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "credential", name: "OPENAI_API_KEY", location: ".env" }, basis: "configured", note: "not issued to me" }] });
    const map = await buildNetworkMap(net.human);
    expect(map.nodes.find((node) => node.kind === "credential" && node.label === "OPENAI_API_KEY")).toMatchObject({ ref: "OPENAI_API_KEY@.env", signals: ["unissued_credential"] });
  });

  it("an agent seen on this machine becomes a source when it connects, keeping what was said about it", async () => {
    const a = await checkIn(net.key.ctx, release);
    await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "agent", name: "a Cursor agent", harness: "cursor" }, basis: "running" }] });
    const lead = (await buildNetworkMap(net.human)).nodes.find((node) => node.kind === "agent" && node.state === "lead");
    expect(lead?.attributes).toMatchObject({ harness: "cursor", host: "maya-mbp" });
    const connected = await checkIn(net.key.ctx, { name: "maya-cursor", harness: "Cursor", host: "maya-mbp", principal: { name: "Maya Chen", email: "maya@northstar.dev" } });
    expect(connected.connectedLead).toEqual({ label: "a Cursor agent", reportedBy: 1 });
    const map = await buildNetworkMap(net.human);
    const node = map.nodes.find((candidate) => candidate.id === lead!.id);
    expect(node).toMatchObject({ state: "source", label: "maya-cursor" });
    expect(map.edges.some((edge) => edge.target === lead!.id && edge.relation === "sees")).toBe(true);
    expect(countsOf(map).sources).toBe(2);
    expect((await listEvents(net.human, { kind: "lead_connected" }))).toHaveLength(1);
  });
});

describe("activity", () => {
  it("maps actions to relations, counts repeats and keeps recent summaries", async () => {
    const a = await checkIn(net.key.ctx, release);
    const at = new Date(Date.now() - 3600_000).toISOString();
    await reportActivity(net.key.ctx, {
      agentId: a.agentId,
      activities: [
        { action: "read", targets: [{ kind: "repository", name: "git@github.com:northstar/web.git" }], summary: "read PR #482 diff", at },
        { action: "query", targets: [{ kind: "data_store", name: "snowflake" }], summary: "row counts" },
        { action: "deploy", targets: [{ kind: "service", name: "https://api.northstar.dev/v1?token=abc" }], summary: "deploy preview" },
        { action: "spawn", targets: [{ kind: "agent", name: "test-runner" }] },
      ],
    });
    const map = await buildNetworkMap(net.human);
    const repo = map.nodes.find((node) => node.kind === "repository")!;
    const edge = map.edges.find((candidate) => candidate.target === repo.id)!;
    expect(edge).toMatchObject({ relation: "reads", count: 2, recent: ["read PR #482 diff"] });
    expect(map.nodes.find((node) => node.kind === "service")?.ref).toBe("api.northstar.dev");
    expect(map.edges.find((candidate) => candidate.relation === "spawned")).toBeTruthy();
    expect(map.nodes.find((node) => node.label === "release-assistant")?.signals).toContain("privileged_reach");
  });

  it("refuses an agentId from another key, and reports from a revoked key", async () => {
    const a = await checkIn(net.key.ctx, release);
    const other = await intakeKey(net.human, "Other team");
    await expect(reportActivity(other.ctx, { agentId: a.agentId, activities: [{ action: "read", targets: [{ kind: "resource", name: "x" }] }] })).rejects.toThrow(/No agent/);
    await revokeKey(net.human, { keyId: net.key.keyId });
    expect(await authenticateIntakeKey(t.db, net.key.token)).toBeNull();
  });

  it("set_task and check_out update the source and log", async () => {
    const a = await checkIn(net.key.ctx, release);
    await setTask(net.key.ctx, { agentId: a.agentId, task: "Cut release 2.4" });
    await checkOut(net.key.ctx, { agentId: a.agentId, summary: "Reviewed and approved" });
    const [source] = await listSources(net.human, {});
    expect(source).toMatchObject({ task: "Cut release 2.4" });
    expect(source?.checkedOutAt).toBeInstanceOf(Date);
    const kinds = (await listEvents(net.human, {})).map((e) => e.kind);
    expect(kinds.slice(0, 3)).toEqual(["check_out", "task", "check_in"]);
  });
});

describe("people's calls", () => {
  it("trace, dismiss and reopen; agents cannot", async () => {
    const a = await checkIn(net.key.ctx, release);
    await reportSightings(net.key.ctx, { agentId: a.agentId, sightings: [{ target: { kind: "mcp_server", name: "notes-sync" }, basis: "configured" }] });
    const node = (await buildNetworkMap(net.human)).nodes.find((n) => n.label === "notes-sync")!;
    await expect(traceEntity(net.key.ctx, { entityId: node.id })).rejects.toThrow(/Only a person/);
    await traceEntity(net.human, { entityId: node.id, note: "Approved by IT" });
    let map = await buildNetworkMap(net.human);
    expect(map.nodes.find((n) => n.id === node.id)).toMatchObject({ state: "traced", signals: [] });
    await reopenEntity(net.human, { entityId: node.id });
    await dismissEntity(net.human, { entityId: node.id });
    map = await buildNetworkMap(net.human);
    expect(map.nodes.find((n) => n.id === node.id)?.state).toBe("dismissed");
    const dossier = await getDossier(net.human, { entityId: node.id });
    expect(dossier.edges[0]).toMatchObject({ direction: "in", relation: "sees", reporterName: "release-assistant", basis: "configured" });
    expect(dossier.events.map((e) => e.kind)).toEqual(["dismissed", "reopened", "traced", "sighting"]);
  });

  it("agents cannot read the map", async () => {
    await expect(buildNetworkMap(net.key.ctx).then(() => listSources(net.key.ctx, {}))).rejects.toThrow(/do not read/);
  });
});

describe("isolation", () => {
  it("one network's key never sees or touches another network's nodes", async () => {
    const other = await seedNetwork(t.db, { name: "Globex" });
    const a = await checkIn(net.key.ctx, release);
    const b = await checkIn(other.key.ctx, release);
    expect(a.agentId).not.toBe(b.agentId);
    await expect(reportActivity(other.key.ctx, { agentId: a.agentId, activities: [{ action: "read", targets: [{ kind: "resource", name: "x" }] }] })).rejects.toThrow(/No agent/);
    const mine = await buildNetworkMap(net.human);
    const theirs = await buildNetworkMap(other.human);
    expect(mine.nodes.every((node) => !theirs.nodes.some((their) => their.id === node.id))).toBe(true);
    const node = theirs.nodes[0]!;
    await expect(getDossier(net.human, { entityId: node.id })).rejects.toThrow(/No node/);
  });
});

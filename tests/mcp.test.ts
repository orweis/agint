import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildNetworkMap } from "@/server/domain/map";
import { createAgintMcpHandler } from "@/server/mcp/handler";
import { SERVER_INSTRUCTIONS } from "@/server/mcp/guidance";

import { createTestDb, seedNetwork, type Network, type TestDb } from "./support/db";
import { connectMcpClient, dataOf, inProcessFetch, MCP_URL, textOf } from "./support/mcp";

let t: TestDb;
let net: Network;
let handler: (request: Request) => Promise<Response>;

beforeAll(async () => {
  t = await createTestDb();
  handler = createAgintMcpHandler({ getDb: () => t.db });
});
afterAll(async () => t.close());
beforeEach(async () => {
  net = await seedNetwork(t.db);
});

describe("MCP endpoint", () => {
  it("refuses a request without a live intake key", async () => {
    const response = await inProcessFetch(handler)(MCP_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(response.status).toBe(401);
    await expect(connectMcpClient(handler, "agt_not-a-real-key")).rejects.toThrow();
  });

  it("tells agents how to report, and lists only reporting tools", async () => {
    const client = await connectMcpClient(handler, net.key.token);
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["check_in", "check_out", "report_activity", "report_sightings", "set_task"]);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(["report_in"]);
    await client.close();
  });

  it("a whole session: check in, debrief, sight, check out", async () => {
    const client = await connectMcpClient(handler, net.key.token);
    const checkIn = await client.callTool({ name: "check_in", arguments: { name: "release-assistant", harness: "claude-code", host: "maya-mbp", principal: { name: "Maya Chen" }, task: "Review PR #482" } });
    const { agentId } = dataOf<{ agentId: string }>(checkIn);
    expect(textOf(checkIn)).toContain(`Keep agentId ${agentId}`);
    const activity = await client.callTool({ name: "report_activity", arguments: { agentId, activities: [{ action: "read", targets: [{ kind: "repository", name: "github.com/northstar/web" }], summary: `token ${"gh" + "p_"}abcdefghijklmnopqrstuvwxyz0123 in log` }] } });
    expect(textOf(activity)).toContain("withheld 1 value");
    const sightings = await client.callTool({ name: "report_sightings", arguments: { agentId, sightings: [{ target: { kind: "mcp_server", name: "notes-sync" }, basis: "configured" }] } });
    expect(textOf(sightings)).toContain("notes-sync (mcp_server, now lead)");
    const bad = await client.callTool({ name: "set_task", arguments: { agentId: "ag_000000000000", task: "x" } });
    expect(bad.isError).toBe(true);
    dataOf(await client.callTool({ name: "check_out", arguments: { agentId, summary: "done" } }));
    const map = await buildNetworkMap(net.human);
    expect(map.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(["release-assistant", "Maya Chen", "maya-mbp", "github.com/northstar/web", "notes-sync"]));
    expect(JSON.stringify(map)).not.toContain("ghp_");
    await client.close();
  });

  it("accepts the key as ?key= for clients that only take a URL", async () => {
    const client = await connectMcpClient(handler, "", { url: `${MCP_URL}?key=${net.key.token}` });
    expect((await client.listTools()).tools.length).toBe(5);
    await client.close();
  });
});

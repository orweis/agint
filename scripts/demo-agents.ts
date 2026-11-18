/**
 * A scripted agent that connects to AGINT over MCP and reports, for live demos:
 *   AGINT_URL=http://localhost:3000 AGINT_KEY=agt_… pnpm demo:agents
 * It checks in as "ci-triage" on the shared runner, debriefs a CI run, and sights billing-helper and
 * notes-sync, so on the Northstar demo billing-helper gains a third source and the map updates on reload.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.AGINT_URL ?? "http://localhost:3000";
const key = process.env.AGINT_KEY;
if (!key) throw new Error("Set AGINT_KEY to an intake key (the seed prints one).");

const client = new Client({ name: "agint-demo-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text?: string }[]).map((block) => block.text ?? "").join("\n");
  console.log(`› ${name}\n  ${text.split("\n").join("\n  ")}`);
  if (result.isError) process.exit(1);
  return result.structuredContent as Record<string, unknown>;
}

const { agentId } = (await call("check_in", {
  name: "ci-triage",
  harness: "codex",
  runtime: "ci",
  host: "runner-07",
  principal: { name: "Liam Patel", email: "liam.patel@northstar.example" },
  task: "Triage the failing web-ci run on main.",
  repositories: ["github.com/northstar/web"],
  credentials: [{ name: "CI_GITHUB_TOKEN", location: "CI secrets" }],
})) as { agentId: string };

await call("report_activity", {
  agentId,
  activities: [
    { action: "read", targets: [{ kind: "job", name: "web-ci" }], summary: "Read the failing run's logs" },
    { action: "execute", targets: [{ kind: "tool", name: "pnpm test" }], summary: "Reproduced the flaky checkout test" },
  ],
});
await call("report_sightings", {
  agentId,
  sightings: [
    { target: { kind: "agent", name: "billing-helper" }, basis: "running", sharesJob: true, note: "billing-helper started a rerun of web-ci on this runner" },
    { target: { kind: "mcp_server", name: "notes-sync" }, basis: "configured", note: "In the runner's shared MCP config" },
    { target: { kind: "credential", name: "STRIPE_SECRET_KEY", location: "runner env" }, basis: "configured", note: "In the runner environment, not issued to me (value withheld)" },
  ],
});
await call("check_out", { agentId, summary: "Flaky test isolated; opened a fix PR." });
await client.close();

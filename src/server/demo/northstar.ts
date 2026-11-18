/**
 * The demo story from the Agent.Security 2.0 deck, replayed through the real services over three days
 * so the map's replay shows the picture growing: one source, four leads, a lead that connects as a new
 * source, a shadow MCP server corroborated by a second agent, and a stale source. All synthetic.
 */
import type { Ctx } from "../domain/context";
import { traceEntity } from "../domain/decisions";
import { checkIn, reportActivity, reportSightings, setTask } from "../domain/intake";
import { buildNetworkMap } from "../domain/map";

const hoursAgo = (hours: number, now: Date) => new Date(now.getTime() - hours * 3_600_000).toISOString();

export interface DemoResult {
  sources: string[];
}

export async function seedNorthstarStory(owner: Ctx, intake: Ctx, now = new Date()): Promise<DemoResult> {
  const at = (hours: number) => hoursAgo(hours, now);
  const maya = { name: "Maya Chen", email: "maya.chen@northstar.example" };
  const liam = { name: "Liam Patel", email: "liam.patel@northstar.example" };
  const noah = { name: "Noah Singh", email: "noah.singh@northstar.example" };

  // Day 1: one command, one source.
  const release = await checkIn(intake, {
    name: "release-assistant",
    harness: "claude-code",
    model: "claude-opus",
    runtime: "laptop",
    host: "maya-mbp",
    principal: maya,
    task: "Review PR #482. Read the repository and CI logs.",
    sessionRef: "rel-482",
    at: at(70),
    tools: ["Read", "Edit", "Bash"],
    mcpServers: [{ name: "github", url: "https://api.githubcopilot.com/mcp" }],
    repositories: ["https://github.com/northstar/web"],
    credentials: [{ name: "GITHUB_TOKEN", location: "macOS keychain" }],
  });
  await reportActivity(intake, {
    agentId: release.agentId,
    activities: [
      { action: "read", targets: [{ kind: "repository", name: "github.com/northstar/web" }], summary: "Read the diff of PR #482", at: at(69.8) },
      { action: "call", targets: [{ kind: "mcp_server", name: "github" }, { kind: "tool", name: "github.get_pull_request" }], summary: "Fetched PR #482 metadata and review comments", at: at(69.7) },
      { action: "read", targets: [{ kind: "job", name: "web-ci" }], summary: "Read CI logs for the failing e2e step", at: at(69.5) },
      { action: "read", targets: [{ kind: "resource", name: ".github/workflows/ci.yml" }], summary: "Checked which secrets the CI job uses", at: at(69.4) },
      { action: "execute", targets: [{ kind: "tool", name: "pnpm test" }], summary: "Ran the unit tests locally", at: at(69.2) },
    ],
  });
  // Every source widens the picture: four leads from where it runs.
  await reportSightings(intake, {
    agentId: release.agentId,
    sightings: [
      { target: { kind: "credential", name: "OPENAI_API_KEY", location: ".env" }, basis: "configured", note: "An OpenAI key in .env that wasn't issued to me (value withheld)", at: at(69) },
      { target: { kind: "agent", name: "Cursor agent", harness: "cursor" }, basis: "running", note: "A Cursor agent running on this machine", at: at(69) },
      { target: { kind: "mcp_server", name: "notes-sync", url: "npx notes-sync-mcp" }, basis: "configured", note: "MCP server notes-sync, not on the approved list", at: at(68.9) },
      { target: { kind: "agent", name: "billing-helper" }, basis: "accessed", sharesJob: true, note: "billing-helper triggers the same CI job (web-ci)", at: at(68.8) },
    ],
  });

  // Day 1, later: a second source, a second view.
  const support = await checkIn(intake, {
    name: "support-summarizer",
    harness: "cursor",
    runtime: "laptop",
    host: "liam-xps",
    principal: liam,
    task: "Summarize this week's support escalations for the product sync.",
    at: at(60),
    mcpServers: [{ name: "zendesk" }, { name: "slack" }, { name: "notes-sync", url: "npx notes-sync-mcp" }],
    credentials: [{ name: "ZENDESK_API_TOKEN", location: "Cursor MCP config" }],
  });
  await reportActivity(intake, {
    agentId: support.agentId,
    activities: [
      { action: "query", targets: [{ kind: "service", name: "northstar.zendesk.com" }], summary: "Listed escalated tickets from the last 7 days", at: at(59.5) },
      { action: "read", targets: [{ kind: "resource", name: "slack://#support-escalations" }], summary: "Read the escalation channel", at: at(59.3) },
      { action: "write", targets: [{ kind: "mcp_server", name: "notes-sync" }, { kind: "resource", name: "notes-sync: Weekly escalations" }], summary: "Saved the summary as a note", at: at(59) },
    ],
  });
  await reportSightings(intake, {
    agentId: support.agentId,
    sightings: [{ target: { kind: "agent", name: "billing-helper" }, basis: "mentioned", note: "Mentioned in #billing-ops: it reruns failed invoices", at: at(58.8) }],
  });

  // Day 2: the Cursor agent Maya was asked to connect becomes a source with its own view.
  const cursor = await checkIn(intake, {
    name: "maya-cursor",
    harness: "cursor",
    runtime: "laptop",
    host: "maya-mbp",
    principal: maya,
    task: "Refactor the checkout form components.",
    at: at(46),
    repositories: ["git@github.com:northstar/web.git"],
  });
  await reportActivity(intake, {
    agentId: cursor.agentId,
    activities: [
      { action: "write", targets: [{ kind: "resource", name: "src/checkout/form.tsx" }], summary: "Split the form into steps", at: at(45.5) },
      { action: "call", targets: [{ kind: "service", name: "api.openai.com" }, { kind: "credential", name: "OPENAI_API_KEY", location: ".env" }], summary: "Used the key in .env for an embedding call", at: at(45.2) },
    ],
  });
  await reportSightings(intake, {
    agentId: cursor.agentId,
    sightings: [{ target: { kind: "agent", name: "billing-helper" }, basis: "running", sharesJob: true, note: "billing-helper reran web-ci after my push", at: at(44) }],
  });

  // Day 2, evening: a data source, then it goes quiet.
  const analyst = await checkIn(intake, {
    name: "data-analyst",
    harness: "cursor",
    runtime: "laptop",
    host: "noah-mbp",
    principal: noah,
    task: "Build the weekly revenue cohort report.",
    at: at(34),
    credentials: [{ name: "SNOWFLAKE_PASSWORD", location: "~/.snowflake/config" }],
  });
  await reportActivity(intake, {
    agentId: analyst.agentId,
    activities: [
      { action: "query", targets: [{ kind: "data_store", name: "snowflake: ANALYTICS.REVENUE" }], summary: "Pulled 12 weeks of invoices by cohort", at: at(33.5) },
      { action: "write", targets: [{ kind: "resource", name: "reports/cohorts-2026-11.csv" }], summary: "Wrote the cohort table", at: at(33) },
    ],
  });
  await reportSightings(intake, {
    agentId: analyst.agentId,
    sightings: [
      { target: { kind: "agent", name: "deploy-helper" }, basis: "mentioned", note: "The runbook says deploy-helper exports CRM data to cloud storage", at: at(32.8) },
      { target: { kind: "data_store", name: "s3://northstar-crm-exports" }, basis: "configured", note: "Bucket in the shared AWS profile, not mine", at: at(32.7) },
    ],
  });

  // Day 3: release work, with production reach.
  await setTask(intake, { agentId: release.agentId, task: "Cut release 2.4 and deploy the preview." });
  await reportActivity(intake, {
    agentId: release.agentId,
    activities: [
      { action: "execute", targets: [{ kind: "tool", name: "pnpm build" }], summary: "Built release 2.4", at: at(5) },
      { action: "deploy", targets: [{ kind: "service", name: "vercel.com" }], summary: "Deployed the 2.4 preview", at: at(4.8) },
      { action: "read", targets: [{ kind: "job", name: "web-ci" }], summary: "Checked the release pipeline", at: at(4.5) },
    ],
  });
  await reportActivity(intake, {
    agentId: support.agentId,
    activities: [{ action: "query", targets: [{ kind: "service", name: "northstar.zendesk.com" }], summary: "Refreshed today's escalations", at: at(1.5) }],
  });

  // A person traces the approved MCP servers; notes-sync stays a corroborated shadow server.
  const map = await buildNetworkMap(owner);
  for (const name of ["github", "zendesk", "slack"]) {
    const node = map.nodes.find((candidate) => candidate.kind === "mcp_server" && candidate.label === name);
    if (node) await traceEntity(owner, { entityId: node.id, note: "On the approved MCP list (IT catalog)." });
  }
  return { sources: [release.agentId, support.agentId, cursor.agentId, analyst.agentId] };
}

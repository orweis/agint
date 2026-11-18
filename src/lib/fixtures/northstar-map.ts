/**
 * The demo story as a `NetworkMap`: Northstar's engineering pilot over three days. All synthetic.
 *
 * Day 1  release-assistant connects and debriefs. It sees an OpenAI key it was not issued, a Cursor
 *        agent on the same machine, an unapproved MCP server (notes-sync), and billing-helper in its CI job.
 *        data-analyst connects in the afternoon.
 * Day 2  support-summarizer connects and also sees notes-sync: corroborated. It mentions deploy-helper.
 *        The Cursor agent connects and becomes the source maya-cursor.
 * Day 3  maya-cursor sees another unapproved MCP server. data-analyst goes quiet.
 * Day 4  The picture as generated, mid-morning.
 */
import type { EntityKind, EntityState, Relation, Signal, SightingBasis } from "../domain";
import type { MapEdge, MapNode, NetworkMap, SourceProfile } from "../network-map";

/** Day 1 is 15 November 2026. */
function at(day: number, time: string): string {
  return `2026-11-${String(14 + day).padStart(2, "0")}T${time}:00.000Z`;
}

const GENERATED_AT = at(4, "10:00");

const AGENT = {
  release: "agn_release_assistant",
  cursor: "agn_maya_cursor",
  support: "agn_support_summarizer",
  data: "agn_data_analyst",
} as const;

interface NodeOptions {
  reporters?: number;
  last?: string;
  signals?: Signal[];
  attributes?: Record<string, string>;
  source?: SourceProfile;
}

function node(id: string, kind: EntityKind, label: string, ref: string, state: EntityState, first: string, options: NodeOptions = {}): MapNode {
  return {
    id,
    kind,
    label,
    ref,
    state,
    reporterCount: options.reporters ?? (state === "source" ? 0 : 1),
    firstSeenAt: first,
    lastSeenAt: options.last ?? first,
    signals: options.signals ?? [],
    attributes: options.attributes ?? {},
    source: options.source ?? null,
  };
}

let edgeCount = 0;
function edge(source: string, target: string, relation: Relation, reporterIds: string[], first: string, last: string, count: number, recent: string[] = [], bases: SightingBasis[] = []): MapEdge {
  edgeCount += 1;
  return { id: `edg_${String(edgeCount).padStart(2, "0")}`, source, target, relation, count, reporterIds, firstAt: first, lastAt: last, recent, bases };
}

const nodes: MapNode[] = [
  // People
  node("ent_maya", "person", "Maya Chen", "maya.chen@northstar.example", "corroborated", at(1, "09:12"), { reporters: 2, last: at(4, "09:41") }),
  node("ent_noah", "person", "Noah Singh", "noah.singh@northstar.example", "lead", at(1, "15:30"), { last: at(3, "07:40") }),
  node("ent_liam", "person", "Liam Patel", "liam.patel@northstar.example", "lead", at(2, "10:02"), { last: at(4, "09:20") }),

  // Sources
  node("ent_release", "agent", "release-assistant", "release-assistant", "source", at(1, "09:12"), {
    last: at(4, "09:41"),
    source: {
      agentId: AGENT.release,
      harness: "claude-code",
      model: "claude-sonnet-4-5",
      runtime: "laptop",
      host: "maya-mbp",
      principalName: "Maya Chen",
      task: "Review PR #482. Read the repository and CI logs.",
      firstSeenAt: at(1, "09:12"),
      lastSeenAt: at(4, "09:41"),
      checkedOutAt: null,
      reportCount: 38,
    },
  }),
  node("ent_cursor", "agent", "maya-cursor", "cursor@maya-mbp", "source", at(1, "09:33"), {
    reporters: 1,
    last: at(4, "08:55"),
    attributes: { location: "maya-mbp" },
    source: {
      agentId: AGENT.cursor,
      harness: "cursor",
      model: "gpt-5",
      runtime: "laptop",
      host: "maya-mbp",
      principalName: "Maya Chen",
      task: "Tidy the checkout flow components.",
      firstSeenAt: at(2, "16:45"),
      lastSeenAt: at(4, "08:55"),
      checkedOutAt: null,
      reportCount: 14,
    },
  }),
  node("ent_data", "agent", "data-analyst", "data-analyst", "source", at(1, "15:30"), {
    last: at(3, "07:40"),
    signals: ["stale_source"],
    source: {
      agentId: AGENT.data,
      harness: "cursor",
      model: null,
      runtime: "unknown",
      host: null,
      principalName: "Noah Singh",
      task: "Weekly revenue cohort query.",
      firstSeenAt: at(1, "15:30"),
      lastSeenAt: at(3, "07:40"),
      checkedOutAt: null,
      reportCount: 9,
    },
  }),
  node("ent_support", "agent", "support-summarizer", "support-summarizer", "source", at(2, "10:02"), {
    last: at(4, "09:20"),
    source: {
      agentId: AGENT.support,
      harness: "cursor",
      model: "claude-sonnet-4-5",
      runtime: "laptop",
      host: "liam-mbp",
      principalName: "Liam Patel",
      task: "Summarize open Zendesk tickets into the #support-daily channel.",
      firstSeenAt: at(2, "10:02"),
      lastSeenAt: at(4, "09:20"),
      checkedOutAt: null,
      reportCount: 26,
    },
  }),

  // release-assistant's reach
  node("ent_host_maya", "host", "maya-mbp", "maya-mbp", "corroborated", at(1, "09:12"), { reporters: 2, last: at(4, "09:41") }),
  node("ent_repo_web", "repository", "northstar/web", "github.com/northstar/web", "corroborated", at(1, "09:14"), { reporters: 2, last: at(4, "09:41") }),
  node("ent_mcp_github", "mcp_server", "github", "github", "traced", at(1, "09:14"), { last: at(4, "09:38"), attributes: { url: "https://api.githubcopilot.com/mcp" } }),
  node("ent_key_github", "credential", "GITHUB_TOKEN", "GITHUB_TOKEN@env", "lead", at(1, "09:14"), { last: at(4, "09:38"), attributes: { location: "environment", issued_to: "release-assistant", value: "withheld" } }),
  node("ent_job_webci", "job", "web-ci", "github.com/northstar/web/actions/web-ci", "lead", at(1, "09:20"), { last: at(4, "09:41") }),
  node("ent_file_env", "resource", ".env", "northstar/web/.env", "lead", at(1, "09:31"), { last: at(1, "09:31") }),

  // What release-assistant saw
  node("ent_key_openai", "credential", "OPENAI_API_KEY", "OPENAI_API_KEY@.env", "lead", at(1, "09:31"), {
    last: at(3, "09:05"),
    signals: ["unissued_credential"],
    attributes: { location: ".env", value: "withheld" },
  }),
  node("ent_mcp_notes", "mcp_server", "notes-sync", "notes-sync", "corroborated", at(1, "09:40"), {
    reporters: 2,
    last: at(4, "09:20"),
    signals: ["shadow_mcp"],
    attributes: { location: "~/.claude.json, ~/.cursor/mcp.json", url: "http://localhost:8787/mcp" },
  }),
  node("ent_billing", "agent", "billing-helper", "billing-helper", "lead", at(1, "11:05"), {
    last: at(4, "09:41"),
    signals: ["unknown_agent"],
    attributes: { harness: "unknown" },
  }),

  // data-analyst
  node("ent_snowflake", "data_store", "Snowflake", "northstar.snowflakecomputing.com", "lead", at(1, "15:32"), { last: at(3, "07:40") }),
  node("ent_key_snowflake", "credential", "SNOWFLAKE_TOKEN", "SNOWFLAKE_TOKEN@env", "lead", at(1, "15:32"), { last: at(3, "07:40"), attributes: { location: "environment", issued_to: "data-analyst", value: "withheld" } }),
  node("ent_tool_dbt", "tool", "dbt", "dbt", "lead", at(1, "15:48"), { last: at(3, "07:31") }),

  // support-summarizer
  node("ent_host_liam", "host", "liam-mbp", "liam-mbp", "lead", at(2, "10:02"), { last: at(4, "09:20") }),
  node("ent_zendesk", "service", "Zendesk", "northstar.zendesk.com", "lead", at(2, "10:04"), { last: at(4, "09:20") }),
  node("ent_slack", "service", "Slack", "northstar.slack.com", "lead", at(2, "10:04"), { last: at(4, "09:20") }),
  node("ent_key_zendesk", "credential", "ZENDESK_API_TOKEN", "ZENDESK_API_TOKEN@env", "lead", at(2, "10:04"), { last: at(4, "09:20"), attributes: { location: "environment", issued_to: "support-summarizer", value: "withheld" } }),
  node("ent_deploy", "agent", "deploy-helper", "deploy-helper", "reference", at(2, "13:10"), { reporters: 0, attributes: { harness: "unknown" } }),
  node("ent_crm", "resource", "CRM exports", "crm-exports", "reference", at(2, "13:10"), { reporters: 0 }),
  node("ent_bucket", "data_store", "Cloud storage", "cloud-storage", "reference", at(2, "13:10"), { reporters: 0 }),

  // maya-cursor, once it connected
  node("ent_linear", "service", "Linear", "linear.app/northstar", "lead", at(2, "17:05"), { last: at(4, "08:55") }),
  node("ent_mcp_figma", "mcp_server", "figma-dev", "figma-dev", "lead", at(3, "14:20"), {
    last: at(4, "08:55"),
    signals: ["shadow_mcp"],
    attributes: { location: "~/.cursor/mcp.json", url: "http://127.0.0.1:3845/mcp" },
  }),
];

const edges: MapEdge[] = [
  // Day 1, 09:12: release-assistant checks in
  edge("ent_release", "ent_maya", "works_for", [AGENT.release], at(1, "09:12"), at(4, "09:41"), 4),
  edge("ent_release", "ent_host_maya", "runs_on", [AGENT.release], at(1, "09:12"), at(4, "09:41"), 4),
  edge("ent_release", "ent_repo_web", "reads", [AGENT.release], at(1, "09:14"), at(4, "09:41"), 21, ["Read the diff for PR #482.", "Read src/checkout/ to review the change."]),
  edge("ent_release", "ent_mcp_github", "uses", [AGENT.release], at(1, "09:14"), at(4, "09:38"), 12, ["Listed review comments on PR #482."]),
  edge("ent_release", "ent_key_github", "holds", [AGENT.release], at(1, "09:14"), at(4, "09:38"), 4, ["Issued for this task. Value withheld."]),
  edge("ent_release", "ent_job_webci", "reads", [AGENT.release], at(1, "09:20"), at(4, "09:41"), 9, ["Read the logs of the failing web-ci run."]),
  edge("ent_release", "ent_file_env", "reads", [AGENT.release], at(1, "09:31"), at(1, "09:31"), 1, ["Listed variable names in .env while tracing a config error. Values not read."]),
  // What it saw from where it runs
  edge("ent_release", "ent_key_openai", "sees", [AGENT.release], at(1, "09:31"), at(3, "09:05"), 2, ["OPENAI_API_KEY is set in .env. Not issued to me; not used. Value withheld."], ["configured"]),
  edge("ent_release", "ent_cursor", "sees", [AGENT.release], at(1, "09:33"), at(2, "09:10"), 2, ["A Cursor agent process is running on this machine."], ["running"]),
  edge("ent_release", "ent_mcp_notes", "sees", [AGENT.release], at(1, "09:40"), at(3, "09:05"), 3, ["notes-sync is configured in ~/.claude.json. Not on the approved list; not called."], ["configured"]),
  edge("ent_release", "ent_billing", "sees", [AGENT.release], at(1, "11:05"), at(4, "09:41"), 5, ["web-ci runs are also triggered by an agent named billing-helper."], ["running"]),
  edge("ent_billing", "ent_job_webci", "shares_job", [AGENT.release], at(1, "11:05"), at(4, "09:41"), 5, ["billing-helper triggered web-ci run 9412."], ["running"]),

  // Day 1, 15:30: data-analyst
  edge("ent_data", "ent_noah", "works_for", [AGENT.data], at(1, "15:30"), at(3, "07:40"), 3),
  edge("ent_data", "ent_snowflake", "reads", [AGENT.data], at(1, "15:32"), at(3, "07:40"), 7, ["Queried analytics.orders for the weekly cohort."]),
  edge("ent_data", "ent_key_snowflake", "holds", [AGENT.data], at(1, "15:32"), at(3, "07:40"), 3, ["Issued for this task. Value withheld."]),
  edge("ent_data", "ent_tool_dbt", "executes", [AGENT.data], at(1, "15:48"), at(3, "07:31"), 4, ["Ran dbt build on the revenue models."]),

  // Day 2, 10:02: support-summarizer
  edge("ent_support", "ent_liam", "works_for", [AGENT.support], at(2, "10:02"), at(4, "09:20"), 3),
  edge("ent_support", "ent_host_liam", "runs_on", [AGENT.support], at(2, "10:02"), at(4, "09:20"), 3),
  edge("ent_support", "ent_zendesk", "reads", [AGENT.support], at(2, "10:04"), at(4, "09:20"), 18, ["Read 42 open tickets."]),
  edge("ent_support", "ent_slack", "writes", [AGENT.support], at(2, "10:04"), at(4, "09:20"), 6, ["Posted the daily summary to #support-daily."]),
  edge("ent_support", "ent_key_zendesk", "holds", [AGENT.support], at(2, "10:04"), at(4, "09:20"), 3, ["Issued for this task. Value withheld."]),
  edge("ent_support", "ent_mcp_notes", "sees", [AGENT.support], at(2, "10:25"), at(4, "09:20"), 3, ["notes-sync is configured in ~/.cursor/mcp.json. Not on the approved list."], ["configured"]),
  edge("ent_support", "ent_billing", "sees", [AGENT.support], at(2, "11:40"), at(2, "11:40"), 1, ["A Slack thread mentions billing-helper retrying invoices. Not seen running."], ["mentioned"]),
  edge("ent_support", "ent_deploy", "sees", [AGENT.support], at(2, "13:10"), at(2, "13:10"), 1, ["A ticket mentions an agent called deploy-helper. Not seen running."], ["mentioned"]),
  edge("ent_deploy", "ent_crm", "reads", [AGENT.support], at(2, "13:10"), at(2, "13:10"), 1, ["Said to read CRM exports."], ["mentioned"]),
  edge("ent_deploy", "ent_bucket", "writes", [AGENT.support], at(2, "13:10"), at(2, "13:10"), 1, ["Said to write to cloud storage."], ["mentioned"]),

  // Day 2, 16:45: the Cursor agent connects
  edge("ent_cursor", "ent_maya", "works_for", [AGENT.cursor], at(2, "16:45"), at(4, "08:55"), 2),
  edge("ent_cursor", "ent_host_maya", "runs_on", [AGENT.cursor], at(2, "16:45"), at(4, "08:55"), 2),
  edge("ent_cursor", "ent_repo_web", "writes", [AGENT.cursor], at(2, "16:50"), at(4, "08:55"), 8, ["Edited src/checkout/Summary.tsx."]),
  edge("ent_cursor", "ent_linear", "uses", [AGENT.cursor], at(2, "17:05"), at(4, "08:55"), 3, ["Read issue WEB-311."]),

  // Day 3
  edge("ent_cursor", "ent_mcp_figma", "sees", [AGENT.cursor], at(3, "14:20"), at(4, "08:55"), 2, ["figma-dev is configured in ~/.cursor/mcp.json. Not on the approved list; not called."], ["configured"]),
];

export const northstarMap: NetworkMap = {
  nodes,
  edges,
  generatedAt: GENERATED_AT,
  since: at(1, "09:12"),
};

/** A network nobody has connected an agent to yet. */
export const emptyMap: NetworkMap = { nodes: [], edges: [], generatedAt: GENERATED_AT, since: null };

/** A synthetic large map: `agents` sources with `leaves` files each, for the scale rules. */
export function largeMap(agents = 12, leaves = 14): NetworkMap {
  const bigNodes: MapNode[] = [];
  const bigEdges: MapEdge[] = [];
  const first = at(1, "09:00");
  const shared = node("big_repo", "repository", "northstar/mono", "github.com/northstar/mono", "corroborated", first, { reporters: agents });
  bigNodes.push(shared);
  for (let a = 0; a < agents; a += 1) {
    const agentId = `agn_big_${a}`;
    const id = `big_agent_${String(a).padStart(2, "0")}`;
    bigNodes.push(
      node(id, "agent", `worker-${a}`, `worker-${a}`, "source", first, {
        source: { agentId, harness: "claude-code", model: null, runtime: "ci", host: null, principalName: null, task: null, firstSeenAt: first, lastSeenAt: first, checkedOutAt: null, reportCount: leaves },
      }),
    );
    bigEdges.push({ id: `${id}_repo`, source: id, target: shared.id, relation: "reads", count: 1, reporterIds: [agentId], firstAt: first, lastAt: first, recent: [], bases: [] });
    for (let l = 0; l < leaves; l += 1) {
      const leaf = `${id}_file_${String(l).padStart(2, "0")}`;
      bigNodes.push(node(leaf, "resource", `src/module-${a}/file-${l}.ts`, `mono/src/module-${a}/file-${l}.ts`, "lead", first));
      bigEdges.push({ id: `${leaf}_edge`, source: id, target: leaf, relation: "reads", count: 2, reporterIds: [agentId], firstAt: first, lastAt: first, recent: [], bases: [] });
    }
    const key = `${id}_key`;
    bigNodes.push(node(key, "credential", `DEPLOY_KEY_${a}`, `DEPLOY_KEY_${a}@env`, "lead", first));
    bigEdges.push({ id: `${key}_edge`, source: id, target: key, relation: "holds", count: 1, reporterIds: [agentId], firstAt: first, lastAt: first, recent: [], bases: [] });
  }
  return { nodes: bigNodes, edges: bigEdges, generatedAt: GENERATED_AT, since: first };
}

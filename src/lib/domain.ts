/**
 * AGINT's vocabulary, as `as const` arrays that drive the Postgres enums, the zod schemas and the
 * UI's `{ label, tone }` tables. Client-safe: nothing here imports from `src/server`.
 */

/** What a node on the map is. `agent` covers both enrolled sources and agents only seen by others. */
export const ENTITY_KINDS = ["agent", "person", "host", "mcp_server", "tool", "credential", "repository", "service", "data_store", "resource", "job"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/**
 * How much AGINT believes a node exists as described. Each finding is a lead, never a fact.
 * - `source`: an agent that connected and reports for itself.
 * - `reference`: only mentioned (heard of, not seen). Excluded from counts until someone sees it.
 * - `lead`: one reporter saw it (running, configured or accessed). Never probed or enrolled automatically.
 * - `corroborated`: two or more independent reporters saw it.
 * - `traced`: a person confirmed it through identity, runtime or CI evidence.
 * - `dismissed`: a person ruled it out.
 */
export const ENTITY_STATES = ["source", "reference", "lead", "corroborated", "traced", "dismissed"] as const;
export type EntityState = (typeof ENTITY_STATES)[number];

/** States only a person sets; corroboration never overrides them. */
export const HUMAN_STATES = ["traced", "dismissed"] as const satisfies readonly EntityState[];

/**
 * How a reporter knows about what it sighted. "Configured" (seen in a config) is not "accessed".
 * `mentioned` alone makes a reference, not a lead.
 */
export const SIGHTING_BASES = ["running", "configured", "accessed", "mentioned"] as const;
export type SightingBasis = (typeof SIGHTING_BASES)[number];

/** The verb on an edge: what the subject (usually the reporting agent) does with the object. */
export const RELATIONS = [
  "works_for", // agent -> person: who it acts for
  "runs_on", // agent -> host
  "uses", // agent -> tool | mcp_server | service
  "holds", // agent -> credential issued to it
  "reads",
  "writes",
  "executes",
  "calls",
  "deploys",
  "delegates_to", // agent -> agent: hands work over
  "spawned", // agent -> agent: started a sub-agent
  "shares_job", // agent -> job | agent: same pipeline, schedule or service
  "sees", // agent -> anything that is not its own: another agent, an unissued key, a shadow server
] as const;
export type Relation = (typeof RELATIONS)[number];

/** Relations that mean "this is in my reach", as opposed to "I noticed it". */
export const REACH_RELATIONS = ["uses", "holds", "reads", "writes", "executes", "calls", "deploys"] as const satisfies readonly Relation[];
/** Relations between agents. */
export const AGENT_RELATIONS = ["delegates_to", "spawned", "shares_job"] as const satisfies readonly Relation[];

/** What an activity report says the agent did. Mapped to a relation by `relationOfAction`. */
export const ACTIONS = ["read", "write", "create", "delete", "execute", "call", "query", "deploy", "send", "authenticate", "spawn", "delegate", "other"] as const;
export type ActivityAction = (typeof ACTIONS)[number];

export function relationOfAction(action: ActivityAction, targetKind: EntityKind): Relation {
  if (targetKind === "agent") return action === "spawn" ? "spawned" : "delegates_to";
  switch (action) {
    case "read":
    case "query":
      return "reads";
    case "write":
    case "create":
    case "delete":
    case "send":
      return "writes";
    case "execute":
      return "executes";
    case "deploy":
      return "deploys";
    case "authenticate":
      return targetKind === "credential" ? "holds" : "uses";
    case "call":
      return targetKind === "tool" || targetKind === "mcp_server" ? "uses" : "calls";
    default:
      return "uses";
  }
}

/** Where an agent runs, as it reports it. "unknown" is a valid answer, never a failure. */
export const RUNTIMES = ["laptop", "ci", "server", "cloud_sandbox", "browser", "unknown"] as const;
export type Runtime = (typeof RUNTIMES)[number];

/** Harnesses AGINT recognises by name; anything else is reported as free text and shown as is. */
export const KNOWN_HARNESSES = ["claude-code", "cursor", "codex", "copilot", "windsurf", "devin", "langgraph", "crewai", "custom"] as const;

/** Event kinds in the debrief log. */
export const EVENT_KINDS = ["check_in", "activity", "sighting", "task", "check_out", "lead_connected", "corroborated", "traced", "dismissed", "reopened", "key_issued", "key_revoked"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Risk signals AGINT derives from the map (`lib/signals.ts`). */
export const SIGNALS = ["unissued_credential", "shadow_mcp", "unknown_agent", "unattributed_agent", "shared_credential", "privileged_reach", "stale_source"] as const;
export type Signal = (typeof SIGNALS)[number];

export type Tone = "neutral" | "accent" | "good" | "warn" | "danger" | "info";
interface Meta {
  label: string;
  tone: Tone;
}

export const ENTITY_KIND_META: Record<EntityKind, Meta & { plural: string }> = {
  agent: { label: "Agent", plural: "Agents", tone: "accent" },
  person: { label: "Person", plural: "People", tone: "neutral" },
  host: { label: "Host", plural: "Hosts", tone: "neutral" },
  mcp_server: { label: "MCP server", plural: "MCP servers", tone: "info" },
  tool: { label: "Tool", plural: "Tools", tone: "info" },
  credential: { label: "Credential", plural: "Credentials", tone: "warn" },
  repository: { label: "Repository", plural: "Repositories", tone: "neutral" },
  service: { label: "Service", plural: "Services", tone: "neutral" },
  data_store: { label: "Data store", plural: "Data stores", tone: "neutral" },
  resource: { label: "Resource", plural: "Resources", tone: "neutral" },
  job: { label: "Job", plural: "Jobs", tone: "neutral" },
};

export const ENTITY_STATE_META: Record<EntityState, Meta & { description: string }> = {
  source: { label: "Source", tone: "accent", description: "Connected and reports its own view." },
  reference: { label: "Reference", tone: "neutral", description: "Mentioned, not seen. Not counted until someone sees it." },
  lead: { label: "Lead", tone: "warn", description: "One reporter saw it. A lead, never a fact." },
  corroborated: { label: "Corroborated", tone: "warn", description: "Seen by two or more independent reporters." },
  traced: { label: "Traced", tone: "good", description: "A person confirmed it through identity, runtime or CI evidence." },
  dismissed: { label: "Dismissed", tone: "neutral", description: "A person ruled it out." },
};

export const RELATION_META: Record<Relation, { label: string; phrase: string }> = {
  works_for: { label: "Works for", phrase: "works for" },
  runs_on: { label: "Runs on", phrase: "runs on" },
  uses: { label: "Uses", phrase: "uses" },
  holds: { label: "Holds", phrase: "holds" },
  reads: { label: "Reads", phrase: "reads" },
  writes: { label: "Writes", phrase: "writes" },
  executes: { label: "Executes", phrase: "executes" },
  calls: { label: "Calls", phrase: "calls" },
  deploys: { label: "Deploys", phrase: "deploys" },
  delegates_to: { label: "Delegates to", phrase: "delegates to" },
  spawned: { label: "Spawned", phrase: "spawned" },
  shares_job: { label: "Shares a job", phrase: "shares a job with" },
  sees: { label: "Sees", phrase: "sees" },
};

export const SIGNAL_META: Record<Signal, Meta & { description: string }> = {
  unissued_credential: { label: "Unissued key", tone: "danger", description: "An agent saw a credential that was not issued to it. Its value was withheld." },
  shadow_mcp: { label: "Shadow MCP", tone: "warn", description: "An MCP server in use that no person has traced or approved." },
  unknown_agent: { label: "Unknown agent", tone: "warn", description: "An agent others see that has not connected to AGINT." },
  unattributed_agent: { label: "No principal", tone: "warn", description: "An agent that could not say who it works for." },
  shared_credential: { label: "Shared key", tone: "danger", description: "More than one agent holds the same credential." },
  privileged_reach: { label: "Deploys", tone: "warn", description: "An agent that deploys or writes to production services." },
  stale_source: { label: "Quiet", tone: "neutral", description: "A source that has not reported in over a day." },
};

export const LIMITS = {
  name: 120,
  ref: 300,
  summary: 500,
  task: 500,
  note: 1000,
  activitiesPerReport: 50,
  sightingsPerReport: 50,
  targetsPerActivity: 10,
  keyLabel: 80,
  workspaceName: 80,
  workspaceSlug: 48,
  passwordMin: 8,
  passwordMax: 128,
} as const;

export const WORKSPACE_SLUG_PATTERN = "[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?";

export const INTAKE_KEY_PREFIX = "agt_";

/** A source with no report for this long is quiet. */
export const STALE_SOURCE_HOURS = 24;

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.workspaceSlug);
}

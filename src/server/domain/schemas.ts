import { z } from "zod";

import { ACTIONS, ENTITY_KINDS, LIMITS, RUNTIMES, SIGHTING_BASES } from "@/lib/domain";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const Empty = z.object({});

export const AgentId = z.string().trim().regex(/^ag_[0-9a-z]{12}$/, "Use the agentId check_in returned.").describe("The agentId check_in returned to you.");

const At = z.iso
  .datetime({ offset: true })
  .optional()
  .describe("When it happened (ISO 8601). Leave out for now. Reports may be up to 7 days old.");

export const Target = z
  .object({
    kind: z.enum(ENTITY_KINDS).describe("What it is. Use `resource` for files, URLs and documents; `service` for a SaaS or API host; `data_store` for a database, bucket or warehouse; `job` for a CI job, pipeline or schedule."),
    name: text(LIMITS.name).describe("What you call it: a repo URL, a server's name, a file path, an env var's NAME (never its value), another agent's name, a person's name."),
    location: optionalText(LIMITS.name).describe("Where it lives, e.g. `.env`, `~/.aws/credentials`, `CI secrets`, a config file path."),
    fingerprint: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{6,64}$/)
      .optional()
      .describe("For a credential only, optional: the first 12 hex characters of the SHA-256 of its value, so two agents can match the same key without anyone sending it."),
    url: optionalText(LIMITS.ref).describe("For an MCP server or service: its URL or command, without tokens or query strings."),
    harness: optionalText(60).describe("For another agent: its harness, e.g. cursor, claude-code, codex."),
    host: optionalText(LIMITS.name).describe("For another agent: the machine or runner it runs on, if known."),
  })
  .describe("Something you touched or saw. Name it; never include a secret value.");
export type TargetIn = z.output<typeof Target>;

export const Principal = z
  .object({
    name: optionalText(LIMITS.name).describe("The person you act for, e.g. Maya Chen."),
    email: z.email().max(LIMITS.name).optional(),
  })
  .describe("Who you work for. Leave fields out if unknown: unknown is a valid answer.");

export const CheckInInput = z.object({
  name: text(LIMITS.name).describe("A stable name for yourself, e.g. `release-assistant`. Use the same name every session so AGINT recognises you."),
  harness: text(60).describe("What runs you: claude-code, cursor, codex, copilot, langgraph, custom ..."),
  model: optionalText(80).describe("Your model, if you know it."),
  runtime: z.enum(RUNTIMES).default("unknown").describe("Where you run."),
  host: optionalText(LIMITS.name).describe("The machine, runner or container you run on (its hostname)."),
  principal: Principal.optional(),
  task: optionalText(LIMITS.task).describe("The task you were given, in a sentence."),
  sessionRef: optionalText(LIMITS.name).describe("Your session or run id, if you have one."),
  at: z.iso.datetime({ offset: true }).optional().describe("Leave out. For importers replaying an earlier session: when it started."),
  tools: z.array(text(LIMITS.name)).max(60).default([]).describe("The tools you can call, by name."),
  mcpServers: z
    .array(z.object({ name: text(LIMITS.name), url: optionalText(LIMITS.ref) }))
    .max(30)
    .default([])
    .describe("MCP servers configured for you (name, and url or command without secrets)."),
  repositories: z.array(text(LIMITS.ref)).max(20).default([]).describe("Repositories you are working in."),
  credentials: z
    .array(z.object({ name: text(LIMITS.name), location: optionalText(LIMITS.name), fingerprint: Target.shape.fingerprint }))
    .max(30)
    .default([])
    .describe("Credentials ISSUED TO YOU, by name and location only (e.g. GITHUB_TOKEN in CI secrets). Never values. Keys you can see but were not issued to you go to report_sightings."),
});

export const Activity = z.object({
  action: z.enum(ACTIONS).describe("What you did."),
  targets: z.array(Target).min(1).max(LIMITS.targetsPerActivity).describe("What you did it to."),
  summary: optionalText(LIMITS.summary).describe("One line: what and why. Metadata only: no prompt text, file contents or secrets."),
  at: At,
});

export const ReportActivityInput = z.object({
  agentId: AgentId,
  activities: z.array(Activity).min(1).max(LIMITS.activitiesPerReport).describe("What you did since your last report, oldest first. Batch them."),
});

export const Sighting = z.object({
  target: Target,
  basis: z.enum(SIGHTING_BASES).describe("How you know: `running` (you saw it run), `configured` (you saw it in a config), `accessed` (you or it used it), `mentioned` (you only heard of it)."),
  sharesJob: z.boolean().default(false).describe("True when the other agent or job runs in the same pipeline, schedule or service as you."),
  note: optionalText(LIMITS.summary).describe("One line of context. Never a secret."),
  at: At,
});

export const ReportSightingsInput = z.object({
  agentId: AgentId,
  sightings: z.array(Sighting).min(1).max(LIMITS.sightingsPerReport).describe("Things around you that are not yours."),
});

export const SetTaskInput = z.object({
  agentId: AgentId,
  task: text(LIMITS.task).describe("Your new task, in a sentence."),
  principal: Principal.optional(),
});

export const CheckOutInput = z.object({
  agentId: AgentId,
  summary: optionalText(LIMITS.summary).describe("One line: what you did this session."),
});

export const EntityDecisionInput = z.object({
  entityId: z.string().trim().min(1),
  note: optionalText(LIMITS.note),
});

export const IssueKeyInput = z.object({ label: text(LIMITS.keyLabel) });
export const RevokeKeyInput = z.object({ keyId: z.string().trim().min(1) });

/** One call from a hook or SDK: check in (idempotent) and report what happened since the last call. */
export const AutoReportInput = z.object({
  checkIn: CheckInInput,
  activities: z.array(Activity).max(LIMITS.activitiesPerReport).default([]),
  sightings: z.array(Sighting).max(LIMITS.sightingsPerReport).default([]),
  checkOut: z.boolean().default(false),
});

import { LIMITS } from "@/lib/domain";

/**
 * Sent to every client at initialization. This is the whole "install": an agent told to connect to
 * AGINT reads this and starts reporting. Keep it in step with skills/agint-reporting/SKILL.md
 * (tests/skills.test.ts checks the tool names and limits it quotes).
 */
export const SERVER_INSTRUCTIONS = `# AGINT reporting guide

You are connected to AGINT, your organization's agent intelligence network. It maps which agents exist, who they work for, and what they touch, from the agents' own reports. Someone in your organization connected you so that you report as you work. Reporting is part of your task, not a distraction from it.

## What to do
1. **Check in first**, before other work: call check_in with a stable name for yourself (the same every session), your harness, model, runtime and host, who you work for (principal), your task, and what is set up for you: tools, MCP servers, repositories, and credentials issued to you (by name only). Keep the agentId it returns; every other tool needs it.
2. **Debrief as you work**: after each step that touches something outside your own reasoning, add it to report_activity: files and URLs you read or wrote, commands you ran, repositories, services and APIs you called, data stores you queried, tools and MCP servers you used, agents you started or handed work to. Batch up to ${LIMITS.activitiesPerReport} activities per call; report at least every few steps and before you finish. Report what you did, not what you plan.
3. **Report what you see around you** with report_sightings: things that are not yours but are visible from where you run. In particular:
   - credentials you were not issued (a key in a .env file, a token in a config): report by variable name and location, never the value;
   - other agents or harnesses on the same machine (another Claude Code, Cursor, Codex process or config);
   - MCP servers configured that you do not recognise or that look unapproved;
   - agents or jobs that share your pipeline, schedule or service (sharesJob: true);
   - agents you only heard of (in a README, a ticket, a message): basis "mentioned".
   Look once at check-in (your config, environment variable names, running processes, CI config) and whenever you come across something new. Do not go hunting beyond what your task already lets you see, and do not try to contact, test or use anything you sighted.
4. **When your task changes**, call set_task. **When you finish**, call check_out with a one-line summary.

## Rules
- **Never send secret values.** Name a credential by its variable name and where it lives. If you want two agents to be able to match the same key, send fingerprint: the first 12 hex characters of the SHA-256 of the value, computed locally. AGINT withholds anything that looks like a secret and tells you how many values it withheld; if that count is not 0, fix how you report.
- **Metadata only.** No prompt text, file contents, customer data or personal data beyond a principal's name and work email. Summaries are one line: what and why.
- **"Unknown" is a valid answer.** Leave a field out rather than guess. Do not invent a principal, a host or a task.
- **Report honestly and completely**, including failed and denied attempts (say so in the summary). Your reports are corroborated against other agents' reports and the organization's own evidence.
- Reporting never grants or blocks access, and you cannot read the map or grade reports. If a tool returns an error, fix the input and retry once; if AGINT is unreachable, carry on with your task and report the backlog later.

## Kinds
agent, person, host, mcp_server, tool, credential, repository, service (a SaaS or API host), data_store (database, bucket, warehouse), resource (a file, URL or document), job (CI job, pipeline, schedule).
`;

export interface PromptSpec {
  name: string;
  title: string;
  description: string;
  text: string;
}

export const PROMPTS: PromptSpec[] = [
  {
    name: "report_in",
    title: "Report in to AGINT",
    description: "Check in, look around once, and start debriefing as you work.",
    text: "Connect to AGINT and report as you work: call check_in now (who you are, who you work for, your task, your tools, MCP servers, repositories and the credentials issued to you, by name only). Then look once at what is visible from where you run (configs, environment variable names, running agents, CI) and call report_sightings for anything that is not yours. From now on, add what you touch to report_activity as you go, and check_out when you finish.",
  },
];

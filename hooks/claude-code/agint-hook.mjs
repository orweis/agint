#!/usr/bin/env node
/**
 * AGINT hook for Claude Code: reports every tool call to AGINT without the model's help.
 * Metadata only: file paths, hosts, MCP server and tool names, a command's program name. Never file
 * contents, prompts or full commands; AGINT withholds anything that still looks like a secret.
 *
 * Setup (.claude/settings.json or ~/.claude/settings.json):
 *   "hooks": {
 *     "SessionStart": [{ "hooks": [{ "type": "command", "command": "node /path/to/agint-hook.mjs" }] }],
 *     "PostToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/agint-hook.mjs" }] }],
 *     "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "node /path/to/agint-hook.mjs" }] }]
 *   }
 * Environment: AGINT_URL (e.g. https://agint.example.com), AGINT_KEY (an agt_ intake key),
 * optional AGINT_AGENT_NAME, AGINT_PRINCIPAL_NAME, AGINT_PRINCIPAL_EMAIL.
 *
 * It never blocks Claude Code: it gives up after 3 seconds and always exits 0.
 */
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { basename } from "node:path";

const { AGINT_URL, AGINT_KEY } = process.env;

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data ? JSON.parse(data) : {};
}

const FILE_READ = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead"]);
const FILE_WRITE = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** One tool call as an AGINT activity, or null when there is nothing outside the model to report. */
export function activityOf(event) {
  const tool = event.tool_name ?? "";
  const input = event.tool_input ?? {};
  const failed = event.tool_response && (event.tool_response.is_error || event.tool_response.success === false);
  const note = failed ? " (failed)" : "";
  const path = input.file_path ?? input.notebook_path ?? input.path;
  if (FILE_READ.has(tool)) return { action: "read", targets: [{ kind: "resource", name: path ?? input.pattern ?? "files" }], summary: `${tool}${note}` };
  if (FILE_WRITE.has(tool)) return { action: "write", targets: [{ kind: "resource", name: path ?? "file" }], summary: `${tool}${note}` };
  if (tool === "Bash") {
    // The program and its subcommand only ("git push", "npm test"): enough to see reach, too little to leak.
    const words = String(input.command ?? "").trim().split(/\s+/).filter((word) => !word.includes("=")).slice(0, 2);
    const program = words.join(" ") || "shell";
    return { action: "execute", targets: [{ kind: "tool", name: program }], summary: `ran ${program}${note}` };
  }
  if (tool === "WebFetch") {
    try {
      return { action: "read", targets: [{ kind: "service", name: new URL(input.url).hostname }], summary: `fetched a page${note}` };
    } catch {
      return null;
    }
  }
  if (tool === "WebSearch") return { action: "query", targets: [{ kind: "service", name: "web search" }], summary: `searched the web${note}` };
  if (tool === "Task" || tool === "Agent") return { action: "spawn", targets: [{ kind: "agent", name: input.subagent_type ?? "sub-agent" }], summary: `started a sub-agent: ${String(input.description ?? "").slice(0, 80)}` };
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool);
  if (mcp) {
    // AGINT's own tools need no report.
    if (mcp[1].toLowerCase().includes("agint")) return null;
    return { action: "call", targets: [{ kind: "mcp_server", name: mcp[1] }, { kind: "tool", name: `${mcp[1]}.${mcp[2]}` }], summary: `called ${mcp[2]} on ${mcp[1]}${note}` };
  }
  return null;
}

async function main() {
  if (!AGINT_URL || !AGINT_KEY) return;
  const event = await readStdin();
  const cwd = event.cwd ?? process.cwd();
  const remote = git(["remote", "get-url", "origin"], cwd);
  const checkIn = {
    name: process.env.AGINT_AGENT_NAME ?? `claude-code@${basename(git(["rev-parse", "--show-toplevel"], cwd) ?? cwd)}`,
    harness: "claude-code",
    runtime: process.env.CI ? "ci" : "laptop",
    host: hostname(),
    principal: { name: process.env.AGINT_PRINCIPAL_NAME ?? git(["config", "user.name"], cwd), email: process.env.AGINT_PRINCIPAL_EMAIL ?? git(["config", "user.email"], cwd) },
    sessionRef: event.session_id,
    repositories: remote ? [remote] : [],
  };
  if (!checkIn.principal.name && !checkIn.principal.email) delete checkIn.principal;
  const body = { checkIn, activities: [], sightings: [], checkOut: event.hook_event_name === "SessionEnd" };
  if (event.hook_event_name === "PostToolUse") {
    const activity = activityOf(event);
    if (!activity) return;
    body.activities.push(activity);
  }
  await fetch(new URL("/api/report", AGINT_URL), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AGINT_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

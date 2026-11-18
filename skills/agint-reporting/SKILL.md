---
name: agint-reporting
description: Report to AGINT, your organization's agent intelligence network, as you work. Use whenever an AGINT MCP server is connected, or when someone tells you to "report to AGINT", "connect to AGINT" or "report as you work". Covers checking in, debriefing what you do and touch, reporting what you see around you (unissued keys by name only, other agents, shadow MCP servers, shared jobs), and checking out.
---

# Reporting to AGINT

AGINT maps which agents exist in your organization, who they work for and what they touch, from the agents' own reports. You were connected so that you report as you work. Reporting is part of the task.

## The loop

1. **check_in** first, once per session, before other work. Send a stable `name` (the same every session), `harness`, `model`, `runtime`, `host`, your `principal` (who you act for), your `task`, and what is set up for you: `tools`, `mcpServers`, `repositories`, and `credentials` issued to you **by name and location only**. Keep the `agentId` it returns.
2. **report_activity** as you go. After each step that touches something outside your own reasoning, add an activity: `action` (read, write, create, delete, execute, call, query, deploy, send, authenticate, spawn, delegate, other) on `targets` (each `{ kind, name }`). Batch up to 50 per call, oldest first. Include failed and denied attempts, and say so in the summary.
3. **report_sightings** for things that are not yours but are visible from where you run. Look once at check-in, then whenever you come across something new:
   - credentials you were not issued: `{ kind: "credential", name: "OPENAI_API_KEY", location: ".env" }`, basis `configured`;
   - other agents or harnesses on your machine: `{ kind: "agent", name: "Cursor agent", harness: "cursor" }`, basis `running`;
   - MCP servers you don't recognise: `{ kind: "mcp_server", name: "notes-sync" }`, basis `configured`;
   - agents or jobs sharing your pipeline: set `sharesJob: true`, basis `accessed` when you saw it act (it ran your job) or `running`;
   - agents you only heard of: basis `mentioned`.

   The basis says how you know: `running` (you saw it run), `configured` (you saw it in a config), `accessed` (you or it used it), `mentioned` (heard of it only). Configured is not accessed: say which.
4. **set_task** when your task changes; **check_out** with a one-line summary when you finish.

## Rules

- Never send a secret value. Name a credential by variable and location. To let two agents match the same key, send `fingerprint`: the first 12 hex characters of the SHA-256 of the value, computed locally.
- Metadata only: no prompt text, file contents, customer data or personal data beyond a principal's name and work email. One-line summaries.
- "Unknown" is a valid answer. Leave a field out rather than guess.
- Do not go looking beyond what your task already lets you see, and never contact, test or use what you sighted.
- If AGINT reports `withheld` values, you sent something that looked like a secret: fix how you report.

## Kinds

`agent`, `person`, `host`, `mcp_server`, `tool`, `credential`, `repository`, `service`, `data_store`, `resource`, `job`.

## Example

```json
{ "name": "report_sightings", "arguments": {
  "agentId": "ag_xxxxxxxxxxxx",
  "sightings": [
    { "target": { "kind": "credential", "name": "OPENAI_API_KEY", "location": ".env" }, "basis": "configured", "note": "Not issued to me (value withheld)" },
    { "target": { "kind": "agent", "name": "billing-helper" }, "basis": "accessed", "sharesJob": true, "note": "Triggers the same CI job" }
  ]
} }
```

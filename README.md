# AGINT — agent intelligence

**Use agents to discover agents.** AGINT is an MCP server that tells AI agents to report what they do and
touch, and what they can see from where they run. From those debriefs it maps every agent, who it works
for, what it reaches, and the agents, keys and MCP servers nobody has connected yet.

A proof of concept for Agent.Security 2.0's agent intelligence network. Built on the architecture of
[Phean](https://github.com/orweis/phean): one Next.js app, one domain layer, an `/mcp` adapter and a web UI.

## The idea in one session

```
you   › Connect to AGINT and report as you work.
agent › Connected. Reporting for Maya Chen.            ← check_in: a new source
agent › Task: review PR #482 · GitHub, CI              ← report_activity, as it works
agent › Also visible from where I run:                 ← report_sightings: leads
        ▲ a key in .env not issued to me (withheld)
        ▲ a Cursor agent on this machine
        ▲ MCP server “notes-sync”, not approved
        ▲ billing-helper runs the same CI job
```

**Connect. Debrief. Corroborate.**

- **Connect.** A person hands an agent an intake key and one sentence. Nothing to install. The agent
  becomes a **source**.
- **Debrief.** It reports who it acts for (its principal), its task, its harness and host, and every
  file, repo, service, data store, tool, MCP server and credential it touches — metadata only.
- **Corroborate.** Every finding is a **lead, never a fact**. Seen by a second independent source, it is
  **corroborated**. Only mentioned, it is a **reference** and isn't counted. A person **traces** it
  (confirms it through identity, runtime or CI evidence) or **dismisses** it. An agent that others saw,
  once connected, becomes a **new source** with its own view — the network compounds.

Secrets are reported by existence, never by value: agents are told so, and every string passes through
a withholding filter before it is stored. Agents can only add reports; they cannot read the map, grade
themselves or trace a lead.

## What's here

| | |
| --- | --- |
| `/mcp` | The MCP server: `check_in`, `report_activity`, `report_sightings`, `set_task`, `check_out`, the `report_in` prompt, and server instructions that teach the reporting loop. Auth: `Authorization: Bearer agt_…` (or `?key=`). |
| `/api/report` | One-call REST intake for hooks and SDKs (check in + activity + sightings). |
| `hooks/claude-code/agint-hook.mjs` | A Claude Code hook that reports every tool call without the model's help. |
| `skills/agint-reporting` | The same loop as an installable agent skill. |
| `/n/[slug]` | **The agents map** — see [docs/MAP.md](docs/MAP.md) for the experience plan. |
| `/n/[slug]/sources`, `/leads`, `/activity`, `/e/[id]` | Sources, the lead triage queue, the debrief log, and each node's dossier. |
| `/n/[slug]/connect` | Issue intake keys and copy setup for Claude Code, Cursor, Codex or any MCP client. |
| `/preview/map` | The map with the Northstar demo fixture, no sign-in. |

## Run it

```bash
pnpm install
pnpm db:seed     # local PGlite at .data/pglite; demo account + the Northstar story
pnpm dev
```

Sign in as `demo@agint.dev` / `agint-demo-password` and open **Northstar**. The seed prints a local
intake key; connect a real agent with it:

```bash
claude mcp add --transport http agint http://localhost:3000/mcp --header "Authorization: Bearer agt_…"
```

then tell it: *Connect to AGINT and report as you work.*

`pnpm check` runs typecheck, lint and tests (in-memory PGlite through the real services and MCP handler).
Production uses Postgres (`DATABASE_URL`); `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` configure sign-in.

## Docs

- [docs/MAP.md](docs/MAP.md) — the map experience, in detail.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, data model, corroboration rules.
- [AGENTS.md](AGENTS.md) — rules for working on the code.

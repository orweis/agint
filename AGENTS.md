# Working on AGINT

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and, for the map, [docs/MAP.md](docs/MAP.md). This app follows Phean's architecture; the rules below are the ones that are easy to break.

This is Next.js 16: APIs and conventions differ from older versions. Read the guide in `node_modules/next/dist/docs/` before writing route or page code.

## Commands

- `pnpm check` (typecheck, lint, tests) must pass before every commit. Run `pnpm build` too when touching routes or layouts.
- `pnpm test:e2e` builds and runs the Playwright tests on port 3300 against a seeded `.data/e2e`.
- `pnpm db:seed` loads the demo account and the Northstar story. PGlite allows one process at a time: stop the dev server first.
- `PageProps<"/route">` and `LayoutProps<"/route">` are generated; `pnpm typecheck` runs `next typegen` first.

## Rules

- Business rules live in `src/server/domain` as `service(schema, run)` functions. Routes, actions and MCP tools are thin adapters; they never query the database.
- Tenant scoping comes only from `Ctx`: a session's membership, or an intake key's row. Every tenant query goes through `inTenant` or `tenantRow`; never accept a network id or slug from tool input.
- Agents only add reports. Never give an agent tool that reads the map, another source's reports, or changes a state: tracing and dismissing are `lead:decide`, people only.
- Every string an agent sends passes through `withhold` before storage. Never log raw tool input.
- Write to the map only through `graph.ts` (`upsertEntity`, `observe`, `regrade`, `mergeEntity`, `logEvent`), inside the service's `inTransaction`.
- A finding is a lead, never a fact. Don't add code paths that make a single report count as corroborated, or that probe, contact or enrol a lead automatically.
- Labels and tones come from the `*_META` tables in `lib/domain.ts`; paths from `routes`; limits from `LIMITS`.
- `src/lib` is client-safe and must not import from `src/server`.
- `skills/agint-reporting/SKILL.md` and `SERVER_INSTRUCTIONS` in `server/mcp/guidance.ts` teach the same loop; `tests/skills.test.ts` checks them against the tools and schemas.
- Colours are the tokens in `globals.css` (Tailwind's palette is off); never `dark:` or literal colours. Sources violet, leads ember (dashed until corroborated), people teal, things slate, red only for exposed keys.
- Vocabulary is intelligence (source, debrief, lead, corroborate, trace, picture). No military words.

## Tests

- Tests run on in-memory PGlite through the real services and MCP handler. A test seeds its own network with `seedNetwork(db)`.
- Add a case for anything that reads or writes tenant data to the isolation block in `tests/intake.test.ts`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

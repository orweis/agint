# AGINT

Agent intelligence: an MCP server agents report to, mapping agents and everything they touch from their own debriefs. Proof of concept for Agent.Security 2.0.

## Status

**Early placeholder.** This repository currently contains only this README and a `.gitignore`. No server code, package manifest, tests or CI have been committed yet, so there is nothing to install, run or test. The description above states the project's intent, not shipped functionality.

## Planned stack

The `.gitignore` anticipates a Next.js / Vercel app with a local PGlite database (`.data/`). This is a hint about intended tooling, not a committed decision; this section will be updated when code lands.

## Security

This is a proof of concept and is not hardened for production use. No secrets belong in this repository: keep local configuration in `.env` / `.env.*` files, which are git-ignored (except `.env.example`, a committed template that must contain placeholders only). Please report suspected vulnerabilities privately to the repository owner (for example via GitHub's private vulnerability reporting, if enabled) rather than in a public issue.

## License

No license has been specified yet. Until the owner adds one, the owner has not granted reuse rights beyond those in GitHub's Terms of Service.

# Deploying AGINT to Vercel

AGINT is one Next.js app: the web UI, the auth endpoints, `/mcp` and `/api/report` deploy together as
Vercel Functions, with one Neon Postgres database. It is set up the same way as Phean.

## Setup

1. **Project.** Permit team → New Project → import `orweis/agint` (framework Next.js, Node.js 22.x,
   production branch `main`). If the repository is not listed, add it under GitHub → Settings →
   Applications → Vercel → Repository access.
2. **Database.** Project → Storage → Create Database → **Neon** (Vercel Marketplace), free plan, Neon Auth
   off, region `iad1`. Connect it to Production and Preview, tick **Create database branch for deployment →
   Preview**, leave Development unticked, and set the custom prefix to `DATABASE` (so the app reads
   `DATABASE_URL`).
3. **Environment variables.** `BETTER_AUTH_SECRET` (Production and Preview, `openssl rand -base64 32`).
   `BETTER_AUTH_URL` is optional: it defaults to the production domain on production and the deployment URL
   on previews; set it once there is a custom domain.
4. **Deployment protection.** Vercel Authentication on preview deployments only. Production stays public:
   people sign in with AGINT's own login and agents call `/mcp` with their intake keys.
5. **Deploy.** Every push to `main` deploys production. Vercel runs the `vercel-build` script, which applies
   pending migrations (`drizzle/`) and then runs `next build`; a failed migration fails the build. To ship a
   branch before it merges: `vercel deploy --prod` from a checkout of the branch.

## Smoke test

```bash
curl https://<domain>/api/health
# {"status":"ok","database":"ok","latencyMs":12}
```

Then sign up, create a network, issue an intake key on Connect, and run a scripted agent against it:

```bash
AGINT_URL=https://<domain> AGINT_KEY=agt_… pnpm demo:agents
```

The map should show `ci-triage` as a source with its leads. Production has no demo data: `pnpm db:seed`
is for local development only.

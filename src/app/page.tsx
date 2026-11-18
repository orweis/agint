import Link from "next/link";

import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { getSession } from "@/server/auth/session";

const STEPS = [
  { n: "01", title: "Connect", body: "Tell an agent to connect to the AGINT MCP. That's the whole install: no endpoint agent, no traffic to reroute." },
  { n: "02", title: "Debrief", body: "As it works, it reports who it acts for, its task, its tools, and everything it touches, plus what else it can see from where it runs." },
  { n: "03", title: "Corroborate", body: "Every finding is a lead, never a fact. A second independent source corroborates it; a person traces or dismisses it." },
];

const LEADS = [
  { title: "Keys it wasn't issued", body: "Reported by name and location. The value is withheld, always." },
  { title: "Other harnesses on its machine", body: "The Cursor agent nobody registered becomes a lead, then a source." },
  { title: "Shadow MCP servers", body: "Servers in its config that are not on the approved list." },
  { title: "Agents on shared jobs", body: "Whoever else runs the same pipeline, schedule or service." },
];

const PRINCIPLES = [
  "Metadata by default; prompts and secrets excluded",
  "Leads are never probed or enrolled automatically",
  "“Unknown” is a valid answer, never a failure",
  "Agents report; they can't read the map or grade themselves",
  "Coverage shows its denominator: no claim of a complete inventory",
];

export default async function HomePage() {
  const session = await getSession();
  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {session ? (
            <ButtonLink href={routes.networks()} variant="primary" size="sm">
              Open AGINT
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href={routes.signIn()} variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href={routes.signUp()} variant="primary" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="py-16 sm:py-24">
        <p className="text-sm font-semibold tracking-wide text-source-ink uppercase">Agent intelligence</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-6xl">Use agents to discover agents.</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">
          You can only govern the agents you know about. AGINT finds AI agents and shadow AI through the agents themselves: tell them to connect, and every source widens the picture.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={session ? routes.networks() : routes.signUp()} variant="primary">
            {session ? "Open your networks" : "Start a network"}
          </ButtonLink>
          <ButtonLink href="/preview/map" variant="secondary">
            See the demo map
          </ButtonLink>
        </div>
        <div className="mt-10 max-w-xl rounded-lg border border-rule bg-panel p-4 font-mono text-sm">
          <p className="text-muted">
            <span className="text-source-ink">you ›</span> Connect to AGINT and report as you work.
          </p>
          <p className="mt-1 text-ink-2">
            <span className="text-source-ink">agent ›</span> Connected. Reporting for Maya Chen.
          </p>
          <p className="mt-1 text-ink-2">
            <span className="text-source-ink">agent ›</span> Also visible from where I run:
          </p>
          <ul className="mt-1 space-y-0.5 pl-4 text-lead-ink">
            <li>▲ a key in .env not issued to me (withheld)</li>
            <li>▲ a Cursor agent on this machine</li>
            <li>▲ MCP server “notes-sync”, not approved</li>
            <li>▲ billing-helper runs the same CI job</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" className="border-t border-rule py-14">
        <h2 id="how" className="text-2xl font-bold text-ink">
          Connect. Debrief. Corroborate.
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-lg border border-rule bg-panel p-5">
              <span className="figure text-sm text-source-ink">{step.n}</span>
              <h3 className="mt-1 font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="leads" className="border-t border-rule py-14">
        <h2 id="leads" className="text-2xl font-bold text-ink">
          One source, many leads
        </h2>
        <p className="mt-2 max-w-2xl text-muted">Leads that connect become new sources with their own view. Leads seen by two agents are corroborated. The network compounds.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {LEADS.map((lead) => (
            <li key={lead.title} className="rounded-lg border border-dashed border-lead/60 bg-panel p-5">
              <h3 className="font-semibold text-ink">{lead.title}</h3>
              <p className="mt-1 text-sm text-muted">{lead.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="trust" className="border-t border-rule py-14">
        <h2 id="trust" className="text-2xl font-bold text-ink">
          Built to be trusted
        </h2>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <li key={principle} className="flex gap-2 text-ink-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-source" />
              {principle}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">Complementary by design: your identity, NHI, EDR and gateway stack sees activity and credentials. AGINT adds the agent&apos;s own account of its task, owner and relationships.</p>
      </section>

      <footer className="border-t border-rule py-8 text-sm text-muted">
        AGINT is a proof of concept for Agent.Security 2.0. <Link href={routes.signIn()} className="link">Sign in</Link>
      </footer>
    </div>
  );
}

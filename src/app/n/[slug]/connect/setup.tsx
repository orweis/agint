"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyBlock } from "@/components/ui/copy-block";
import { Field, Input } from "@/components/ui/field";
import { IDLE, stringData } from "@/lib/action-state";
import { cx } from "@/lib/cx";
import { LIMITS } from "@/lib/domain";

import { issueKeyAction } from "../actions";

const CLIENTS = ["Claude Code", "Cursor", "Codex", "Any MCP client", "Auto-report hook"] as const;
type Client = (typeof CLIENTS)[number];

function snippet(client: Client, mcpUrl: string, reportOrigin: string, key: string): string {
  switch (client) {
    case "Claude Code":
      return `claude mcp add --transport http agint ${mcpUrl} --header "Authorization: Bearer ${key}"`;
    case "Cursor":
      return JSON.stringify({ mcpServers: { agint: { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
    case "Codex":
      return `# ~/.codex/config.toml\n[mcp_servers.agint]\nurl = "${mcpUrl}"\nhttp_headers = { Authorization = "Bearer ${key}" }`;
    case "Any MCP client":
      return `URL:    ${mcpUrl}\nHeader: Authorization: Bearer ${key}\n\n# Clients that only take a URL:\n${mcpUrl}?key=${key}`;
    case "Auto-report hook":
      return `# Reports every Claude Code tool call, without the model's help (hooks/claude-code/agint-hook.mjs)\nexport AGINT_URL=${reportOrigin}\nexport AGINT_KEY=${key}\n\n# .claude/settings.json\n${JSON.stringify(
        {
          hooks: {
            SessionStart: [{ hooks: [{ type: "command", command: "node hooks/agint-hook.mjs" }] }],
            PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "node hooks/agint-hook.mjs" }] }],
            SessionEnd: [{ hooks: [{ type: "command", command: "node hooks/agint-hook.mjs" }] }],
          },
        },
        null,
        2,
      )}`;
  }
}

export function ConnectSetup({ slug, mcpUrl, origin, canIssue }: { slug: string; mcpUrl: string; origin: string; canIssue: boolean }) {
  const [state, action, pending] = useActionState(issueKeyAction, IDLE);
  const [client, setClient] = useState<Client>("Claude Code");
  const issued = stringData(state, "token", "label");
  const key = issued?.token ?? "agt_YOUR_KEY";
  return (
    <div className="space-y-6">
      {canIssue && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="network" value={slug} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Key label" htmlFor="label" hint="Who you'll hand it to, e.g. “Platform team” or “Maya's laptop”. One key can serve many agents.">
              <Input id="label" name="label" required maxLength={LIMITS.keyLabel} placeholder="Platform team" />
            </Field>
            <div className="sm:pb-5">
              <Button type="submit" variant="primary" pending={pending}>
                Issue intake key
              </Button>
            </div>
          </div>
          <p role="status" aria-live="polite" className={state.status === "error" ? "text-sm text-danger-ink" : "text-sm text-muted"}>
            {state.status !== "idle" ? state.message : ""}
          </p>
        </form>
      )}
      {issued && (
        <div className="space-y-2 rounded-lg border border-lead/50 bg-lead-tint p-4">
          <p className="text-sm font-semibold text-lead-ink">Key “{issued.label}”: copy it now. AGINT stores only its hash.</p>
          <CopyBlock value={issued.token} label="intake key" />
        </div>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold text-ink">1. Connect the agent</h3>
        <div role="tablist" aria-label="Agent client" className="flex flex-wrap gap-1.5">
          {CLIENTS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={client === name}
              onClick={() => setClient(name)}
              className={cx("h-8 rounded-full border px-3 text-sm font-semibold", client === name ? "border-source bg-source-tint text-source-ink" : "border-rule text-ink-2 hover:bg-fill")}
            >
              {name}
            </button>
          ))}
        </div>
        <CopyBlock value={snippet(client, mcpUrl, origin, key)} label={`${client} setup`} />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink">2. Tell it to report</h3>
        <p className="text-sm text-muted">That&apos;s the whole install. The server&apos;s instructions teach the agent the rest; the skill in <code className="font-mono text-xs">skills/agint-reporting</code> does the same for agents that load skills.</p>
        <CopyBlock value="Connect to AGINT and report as you work." label="instruction" />
      </div>
    </div>
  );
}

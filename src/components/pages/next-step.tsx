import type { EntityKind, EntityState } from "@/lib/domain";

interface NextStep {
  title: string;
  body: string;
}

/** What would move a node on from where it is now. Leads are never probed or enrolled automatically. */
export function nextStepOf(node: { kind: EntityKind; state: EntityState }): NextStep | null {
  const agent = node.kind === "agent";
  switch (node.state) {
    case "source":
      return null;
    case "reference":
      return {
        title: "Needs someone to actually see it",
        body: "It was only mentioned. Once a source reports running, configuring or accessing it, it becomes a lead and starts to count.",
      };
    case "lead":
      return agent
        ? { title: "Ask its owner to connect it", body: "One source saw this agent. Once it connects, it becomes a source and reports for itself. A second source, or a trace, also moves it on." }
        : { title: "A second source, or trace it", body: "One source saw it. A second independent source corroborates it; evidence from identity, runtime or CI lets you trace it." };
    case "corroborated":
      return agent
        ? { title: "Ask its owner to connect it, or trace it", body: "Two or more sources saw it. Connecting it makes it a source; identity, runtime or CI evidence lets you trace it. Dismiss it if it is not real." }
        : { title: "Trace it or dismiss it", body: "Two or more sources saw it. Confirm it with identity, runtime or CI evidence, or rule it out." };
    case "traced":
    case "dismissed":
      return { title: "Decided by a person", body: "New reports keep arriving but do not change a person's call. Reopen it if the evidence changes." };
  }
}

export function NextStepBox({ node }: { node: { kind: EntityKind; state: EntityState } }) {
  const step = nextStepOf(node);
  if (!step) return null;
  return (
    <div className="rounded-lg border border-rule bg-fill px-4 py-3">
      <p className="text-xs font-semibold text-muted">What moves it on</p>
      <p className="mt-0.5 font-semibold text-ink">{step.title}</p>
      <p className="mt-0.5 text-sm text-ink-2">{step.body}</p>
    </div>
  );
}

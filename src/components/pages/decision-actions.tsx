import { dismissAction, reopenAction, traceAction } from "@/app/n/[slug]/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { LIMITS, type EntityState } from "@/lib/domain";

/**
 * A person's calls on a node: Trace (with an optional evidence note) or Dismiss for open findings,
 * Reopen for decided ones. Sources are cut off by revoking their key, not here.
 */
export function DecisionActions({ slug, entityId, label, state }: { slug: string; entityId: string; label: string; state: EntityState }) {
  if (state === "source") return null;
  if (state === "traced" || state === "dismissed") {
    return <ActionForm action={reopenAction} network={slug} fields={{ entityId }} submit="Reopen" variant="secondary" size="sm" />;
  }
  const noteId = `note-${entityId}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <ActionForm action={traceAction} network={slug} fields={{ entityId }} submit="Trace" variant="secondary" size="sm" className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor={noteId} className="sr-only">
          Evidence for tracing {label} (optional)
        </label>
        <div className="max-w-md">
          <Input id={noteId} name="note" maxLength={LIMITS.note} placeholder="Evidence (optional): identity, runtime or CI" autoComplete="off" />
        </div>
      </ActionForm>
      <ActionForm
        action={dismissAction}
        network={slug}
        fields={{ entityId }}
        submit="Dismiss"
        variant="ghost"
        size="sm"
        confirm={`Dismiss “${label}”? It leaves the queue and stops counting until someone reopens it.`}
      />
    </div>
  );
}

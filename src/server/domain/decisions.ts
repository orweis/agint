/**
 * A person's calls on a lead: trace it (confirmed through identity, runtime or CI evidence), dismiss
 * it, or reopen it. Leads are never probed, contacted or enrolled automatically; connecting an agent is
 * the person telling it to connect. A source cannot be traced or dismissed here: revoke its key.
 */
import { tenantRow } from "./context";
import { inTransaction } from "./context";
import { entities } from "../db/schema";
import { conflict, notFound } from "./errors";
import { logEvent, regrade } from "./graph";
import { findEntity } from "./map";
import { assertCan } from "./policy";
import { EntityDecisionInput } from "./schemas";
import { service } from "./service";

function decide(state: "traced" | "dismissed") {
  return service(EntityDecisionInput, async (ctx, input) => {
    assertCan(ctx, "lead:decide");
    return inTransaction(ctx, async (tx) => {
      const entity = await findEntity(tx, input.entityId);
      if (!entity) throw notFound("node", input.entityId);
      if (entity.state === "source") throw conflict(`${entity.label} is a connected source. Revoke its intake key to cut it off.`);
      if (entity.state === state) throw conflict(`${entity.label} is already ${state}.`);
      await tx.db
        .update(entities)
        .set({ state, note: input.note ?? null, stateChangedByName: tx.actor.name, stateChangedAt: new Date() })
        .where(tenantRow(tx, entities, entity.id));
      const verb = state === "traced" ? "traced" : "dismissed";
      await logEvent(tx, state, `${tx.actor.name} ${verb} ${entity.label}${input.note ? `: ${input.note}` : "."}`, { entityId: entity.id });
      return { entityId: entity.id, label: entity.label, state };
    });
  });
}

export const traceEntity = decide("traced");
export const dismissEntity = decide("dismissed");

/** Undoes a person's call: the node goes back to what its reports say (lead, corroborated or reference). */
export const reopenEntity = service(EntityDecisionInput, async (ctx, input) => {
  assertCan(ctx, "lead:decide");
  return inTransaction(ctx, async (tx) => {
    const entity = await findEntity(tx, input.entityId);
    if (!entity) throw notFound("node", input.entityId);
    if (entity.state !== "traced" && entity.state !== "dismissed") throw conflict(`${entity.label} has no decision to undo.`);
    await tx.db.update(entities).set({ state: "lead", note: null, stateChangedByName: tx.actor.name, stateChangedAt: new Date() }).where(tenantRow(tx, entities, entity.id));
    const now = new Date();
    const regraded = (await regrade(tx, entity.id, now)) ?? "lead";
    await logEvent(tx, "reopened", `${tx.actor.name} reopened ${entity.label}.`, { entityId: entity.id, at: now });
    return { entityId: entity.id, label: entity.label, state: regraded };
  });
});

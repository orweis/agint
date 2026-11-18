"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IDLE } from "@/lib/action-state";
import { LIMITS, WORKSPACE_SLUG_PATTERN } from "@/lib/domain";

import { createNetworkAction } from "./actions";

export function CreateNetworkForm() {
  const [state, action, pending] = useActionState(createNetworkAction, IDLE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required maxLength={LIMITS.workspaceName} placeholder="Northstar engineering" />
      </Field>
      <Field label="Address" htmlFor="slug" hint="Optional. Lowercase letters, digits and dashes.">
        <Input id="slug" name="slug" pattern={WORKSPACE_SLUG_PATTERN} maxLength={LIMITS.workspaceSlug} placeholder="northstar" />
      </Field>
      <div className="sm:pb-5">
        <Button type="submit" variant="primary" pending={pending}>
          Create network
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger-ink sm:col-span-3">
          {state.message}
        </p>
      )}
    </form>
  );
}

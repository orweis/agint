"use client";

import { useActionState, type ReactNode } from "react";

import { IDLE, type ActionState } from "@/lib/action-state";

import { Button, type ButtonVariant } from "./button";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

interface ActionFormProps {
  action: Action;
  network: string;
  submit: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  fields?: Record<string, string>;
  children?: ReactNode | ((state: ActionState) => ReactNode);
  confirm?: string;
  className?: string;
}

/** A form bound to a `tenantAction`: posts the network slug and fixed fields, shows the outcome. */
export function ActionForm({ action, network, submit, variant = "primary", size = "md", fields = {}, children, confirm, className }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="network" value={network} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {typeof children === "function" ? children(state) : children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} size={size} pending={pending}>
          {submit}
        </Button>
        <p role="status" aria-live="polite" className={state.status === "error" ? "text-sm text-danger-ink" : "text-sm text-muted"}>
          {state.status !== "idle" ? state.message : ""}
        </p>
      </div>
    </form>
  );
}

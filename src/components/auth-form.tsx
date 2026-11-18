"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { LIMITS } from "@/lib/domain";
import { routes } from "@/lib/routes";

import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const signingUp = mode === "sign-up";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setError(null);
    startTransition(async () => {
      const { error: failure } = signingUp ? await authClient.signUp.email({ name: String(form.get("name")), email, password }) : await authClient.signIn.email({ email, password });
      if (failure) {
        setError(failure.message ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink">{signingUp ? "Create your account" : "Sign in"}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {signingUp && (
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required maxLength={LIMITS.name} />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={signingUp ? `At least ${LIMITS.passwordMin} characters.` : undefined}>
          <Input id="password" name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} minLength={LIMITS.passwordMin} maxLength={LIMITS.passwordMax} required />
        </Field>
        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" pending={pending}>
          {signingUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {signingUp ? "Already have an account? " : "New to AGINT? "}
        <Link href={signingUp ? routes.signIn(next) : routes.signUp(next)} className="link">
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

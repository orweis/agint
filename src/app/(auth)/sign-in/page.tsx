import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site paths are followed after signing in. */
function safeNext(value: string | string[] | undefined): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : routes.networks();
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={safeNext(next)} />;
}

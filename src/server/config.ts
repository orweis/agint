/** The deployment's public address: auth callbacks, and the setup commands the Connect page shows. */
export function appUrl(): string {
  const explicit = process.env.BETTER_AUTH_URL ?? process.env.AGINT_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Every origin a browser may legitimately use to reach this deployment (Vercel's deployment, branch and production aliases). */
export function trustedOrigins(): string[] {
  const hosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter((host): host is string => Boolean(host));
  const extra = (process.env.AGINT_TRUSTED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  return [appUrl(), ...hosts.map((host) => `https://${host}`), ...extra];
}

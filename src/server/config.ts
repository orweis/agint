/** The deployment's public address. */
export function appUrl(): string {
  const explicit = process.env.BETTER_AUTH_URL ?? process.env.AGINT_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === "production") return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function trustedOrigins(): string[] {
  return (process.env.AGINT_TRUSTED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
}

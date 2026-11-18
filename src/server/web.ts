import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { appUrl } from "./config";
import { isDomainError } from "./domain/errors";

export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }
}

/** An absolute URL on the origin the viewer is using, so copied setup commands work on previews too. */
export async function absoluteUrl(path: string): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return new URL(path, host ? `${protocol}://${host}` : appUrl()).toString();
}

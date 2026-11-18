/**
 * Normalized identities, so two reporters naming the same thing land on one node. A ref never holds
 * a secret: credentials are named by variable and location, or by a fingerprint the agent computed.
 */
import type { EntityKind } from "./domain";
import { LIMITS } from "./domain";

export interface TargetInput {
  kind: EntityKind;
  /** What the reporter calls it: a repo URL, a server name, a variable name, an agent's name. */
  name: string;
  /** Optional, kind-specific: where a key lives (".env"), a server's url, an unknown agent's harness or host. */
  location?: string | undefined;
  /** For a credential: a short hex fingerprint (e.g. first 12 of its SHA-256) so two agents can match it without the value. */
  fingerprint?: string | undefined;
  harness?: string | undefined;
  host?: string | undefined;
}

const squash = (value: string) => value.trim().replace(/\s+/g, " ");
const lower = (value: string) => squash(value).toLowerCase();

function stripUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    // Drop credentials, query and fragment: they can carry tokens and they don't name the thing.
    const path = url.pathname.replace(/\.git$/, "").replace(/\/+$/, "");
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return lower(trimmed);
  }
}

/** git@github.com:acme/api.git → github.com/acme/api */
function repoRef(value: string): string {
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(value.trim());
  return scp ? stripUrl(`${scp[1]}/${scp[2]}`) : stripUrl(value);
}

export function agentRef(input: { name?: string | undefined; harness?: string | undefined; host?: string | undefined }): string {
  if (input.name && input.name.trim()) return `name:${lower(input.name)}`;
  return `seen:${lower(input.harness ?? "unknown")}@${lower(input.host ?? "unknown")}`;
}

export function refOf(target: TargetInput): string {
  let ref: string;
  switch (target.kind) {
    case "agent":
      ref = agentRef(target);
      break;
    case "person":
      ref = lower(target.name);
      break;
    case "credential":
      ref = target.fingerprint ? `fp:${target.fingerprint.toLowerCase()}` : `${squash(target.name)}@${lower(target.location ?? "unknown")}`;
      break;
    case "repository":
      ref = repoRef(target.name);
      break;
    case "service":
      ref = /[./:]/.test(target.name) ? stripUrl(target.name).split("/")[0]! : lower(target.name);
      break;
    case "resource":
      ref = /^[a-z]+:\/\//i.test(target.name) ? stripUrl(target.name) : squash(target.name);
      break;
    default:
      ref = lower(target.name);
  }
  return ref.slice(0, LIMITS.ref);
}

/** The display label: the reporter's own words, tidied. */
export function labelOf(target: TargetInput): string {
  if (target.kind === "repository") return repoRef(target.name);
  return squash(target.name).slice(0, LIMITS.name);
}

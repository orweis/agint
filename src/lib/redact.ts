/**
 * Secrets are reported by existence, never by value. Agents are told so, and every string they send
 * passes through `withhold` before it is stored, as a backstop for the one that forgets.
 */

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(sk|rk|pk)-(live|test|proj|ant|svcacct)?-?[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic, Stripe
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g, // GitLab
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(agt|phn|npm|pypi)_[A-Za-z0-9_-]{16,}/g, // our own keys and package tokens
  /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/g, // credentials in a URL
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]\s*["']?[^\s"',;]{6,}/gi, // KEY=value
];

export const WITHHELD = "[withheld]";

export interface Withheld<T> {
  value: T;
  /** How many values were withheld. */
  count: number;
}

/** Replaces anything that looks like a secret value with `[withheld]`. */
export function withholdText(text: string): Withheld<string> {
  let count = 0;
  let value = text;
  for (const pattern of PATTERNS) {
    value = value.replace(pattern, (match) => {
      count += 1;
      // Keep the variable name of a KEY=value pair: it names the thing without giving it away.
      const pair = /^([A-Za-z_][\w-]*)\s*[=:]/.exec(match);
      return pair && !match.includes("://") ? `${pair[1]}=${WITHHELD}` : WITHHELD;
    });
  }
  return { value, count };
}

/** Deeply withholds every string in a JSON-like value. */
export function withhold<T>(input: T): Withheld<T> {
  let count = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const result = withholdText(value);
      count += result.count;
      return result.value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]));
    return value;
  };
  return { value: walk(input) as T, count };
}

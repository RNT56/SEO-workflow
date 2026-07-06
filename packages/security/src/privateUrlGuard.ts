import type { Evidence, Finding } from "@seo-polish/schemas";

export const PRIVATE_PATH_PATTERNS = [
  /\/admin(?:\/|$)/i,
  /\/account(?:\/|$)/i,
  /\/login(?:\/|$)/i,
  /\/logout(?:\/|$)/i,
  /\/signin(?:\/|$)/i,
  /\/signup(?:\/|$)/i,
  /\/checkout(?:\/|$)/i,
  /\/cart(?:\/|$)/i,
  /\/payment(?:\/|$)/i,
  /\/private(?:\/|$)/i,
  /\/preview(?:\/|$)/i,
  /\/staging(?:\/|$)/i,
  /\/token(?:\/|$)/i,
  /\/session(?:\/|$)/i,
  /\/oauth\/callback(?:\/|$)/i,
  /\/api\/internal(?:\/|$)/i
];

export const SECRET_LIKE_PATTERNS = [
  /(?:api[_-]?key|secret|token|password)=\w{12,}/i,
  /(?:^|[?&])redacted_sensitive_query=1(?:&|$)/i,
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/
];

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "code",
  "key",
  "password",
  "refresh_token",
  "secret",
  "session",
  "session_id",
  "sid",
  "token"
]);

const URL_PATTERN = /https?:\/\/[^\s"'<>),]+/gi;
const REDACTED_SENSITIVE_QUERY = "redacted_sensitive_query";

export function isPrivateUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return (
      PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(input)) ||
      SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(input))
    );
  }

  const target = `${url.pathname}${url.search}`;
  return (
    PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(target)) ||
    SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(target))
  );
}

export function findPrivateReferences(text: string): string[] {
  const references = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0];
    if (isPrivateUrl(value)) {
      references.add(value);
    }
  }

  for (const pattern of PRIVATE_PATH_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      references.add(match[0]);
    }
  }

  for (const pattern of SECRET_LIKE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      references.add(match[0]);
    }
  }

  return [...references];
}

export function redactSensitiveReference(input: string): string {
  let output = input;
  try {
    const url = new URL(input);
    let redacted = false;

    if (url.username) {
      url.username = "redacted";
      redacted = true;
    }
    if (url.password) {
      url.password = "redacted";
      redacted = true;
    }

    for (const [key, value] of [...url.searchParams.entries()]) {
      if (isSensitiveQueryKey(key) || SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value))) {
        url.searchParams.delete(key);
        redacted = true;
      }
    }

    if (redacted) {
      url.searchParams.set(REDACTED_SENSITIVE_QUERY, "1");
      output = url.toString();
    }
  } catch {
    output = input;
  }

  return redactCredentialAssignments(output);
}

export function redactSensitiveText(text: string): string {
  const withRedactedUrls = text.replace(URL_PATTERN, (match) => redactSensitiveReference(match));
  return redactCredentialAssignments(withRedactedUrls);
}

export function redactSensitiveValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactSensitiveText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    redacted[key] = redactSensitiveValue(item);
  }
  return redacted as T;
}

export function evidenceContainsPrivateReference(evidence: Evidence): boolean {
  const values = [
    evidence.url,
    evidence.path,
    evidence.header,
    evidence.selector,
    evidence.excerpt,
    String(evidence.value ?? "")
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return values.some((value) => findPrivateReferences(value).length > 0);
}

export function findingContainsPrivateReference(finding: Finding): boolean {
  const text = [
    finding.title,
    finding.impact,
    finding.rootCause,
    finding.recommendation,
    ...finding.affectedUrls,
    ...finding.affectedTemplates,
    ...finding.validation
  ].join("\n");
  return findPrivateReferences(text).length > 0 || finding.evidence.some(evidenceContainsPrivateReference);
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    SENSITIVE_QUERY_KEYS.has(normalized) ||
    normalized.endsWith("_token") ||
    normalized.endsWith("-token") ||
    normalized.includes("secret") ||
    normalized.includes("password")
  );
}

function redactCredentialAssignments(input: string): string {
  let output = input.replace(
    /\b(api[_-]?key|secret|password|token)\s*[:=]\s*["']?[^"'\s&]{8,}/gi,
    (_match, key: string) => `${key}=[REDACTED]`
  );
  output = output.replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-[REDACTED]");
  output = output.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh[REDACTED]");
  output = output.replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, "xox[REDACTED]");
  return output;
}

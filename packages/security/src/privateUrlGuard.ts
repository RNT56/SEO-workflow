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
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/
];

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
  const urlPattern = /https?:\/\/[^\s"'<>),]+/gi;
  for (const match of text.matchAll(urlPattern)) {
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

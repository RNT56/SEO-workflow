import type { FindingCategory, RuleMaturity, Severity } from "@seo-polish/schemas";

export interface RuleDefinition {
  id: string;
  slug: string;
  category: FindingCategory;
  defaultSeverity: Severity;
  implemented: boolean;
  standard: string;
  maturity: RuleMaturity;
}

export const RULE_CATALOG: RuleDefinition[] = [
  rule("SEO-TECH-001", "invalid-http-status", "technical_seo", "critical", true, "http-status"),
  rule("SEO-TECH-002", "redirect-chain-too-long", "technical_seo", "medium", true, "redirects"),
  rule("SEO-TECH-011", "missing-compression", "technical_seo", "low", true, "http-headers"),
  rule("SEO-TECH-012", "poor-cacheability", "technical_seo", "low", true, "http-headers"),
  rule("SEO-CRAWL-001", "robots-missing", "crawlability", "low", true, "robots-txt"),
  rule("SEO-CRAWL-003", "important-page-blocked", "crawlability", "critical", true, "robots-txt"),
  rule("SEO-CRAWL-004", "sitemap-not-linked-in-robots", "crawlability", "medium", true, "robots-txt"),
  rule("SEO-SITEMAP-001", "sitemap-missing", "crawlability", "medium", true, "sitemap"),
  rule("SEO-SITEMAP-002", "sitemap-invalid-xml", "crawlability", "high", true, "sitemap"),
  rule("SEO-SITEMAP-008", "sitemap-contains-private-url", "security", "critical", true, "sitemap"),
  rule("SEO-SITEMAP-011", "important-page-missing-from-sitemap", "crawlability", "medium", true, "sitemap"),
  rule("SEO-INDEX-001", "accidental-noindex", "indexability", "high", true, "robots-meta"),
  rule("SEO-INDEX-003", "canonical-missing", "indexability", "medium", true, "canonicalization"),
  rule("SEO-INDEX-004", "canonical-non-self-reference", "indexability", "medium", true, "canonicalization"),
  rule("SEO-ONPAGE-001", "title-missing", "onpage_seo", "high", true, "html-title"),
  rule("SEO-ONPAGE-002", "title-duplicate", "onpage_seo", "medium", true, "html-title"),
  rule("SEO-ONPAGE-003", "title-too-short", "onpage_seo", "low", true, "html-title"),
  rule("SEO-ONPAGE-004", "title-too-long", "onpage_seo", "low", true, "html-title"),
  rule("SEO-ONPAGE-005", "meta-description-missing", "onpage_seo", "medium", true, "meta-description"),
  rule("SEO-ONPAGE-006", "meta-description-duplicate", "onpage_seo", "medium", true, "meta-description"),
  rule("SEO-ONPAGE-007", "h1-missing", "onpage_seo", "medium", true, "headings"),
  rule("SEO-ONPAGE-008", "multiple-conflicting-h1", "onpage_seo", "medium", true, "headings"),
  rule("SEO-ONPAGE-009", "heading-hierarchy-broken", "onpage_seo", "low", true, "headings"),
  rule("SEO-ONPAGE-010", "missing-html-lang", "onpage_seo", "low", true, "html-lang"),
  rule("SEO-ONPAGE-011", "missing-viewport", "onpage_seo", "medium", true, "viewport"),
  rule("SEO-ONPAGE-014", "missing-open-graph", "onpage_seo", "low", true, "open-graph"),
  rule("SEO-ONPAGE-015", "missing-twitter-card", "onpage_seo", "low", true, "twitter-card"),
  rule("SEO-CONTENT-001", "thin-content", "content_seo", "medium", true, "content-quality"),
  rule("SEO-CONTENT-002", "duplicate-content", "content_seo", "medium", true, "content-quality"),
  rule("SEO-LINK-003", "weak-internal-linking", "internal_linking", "medium", true, "internal-links"),
  rule("SEO-LINK-009", "missing-hub-page", "internal_linking", "low", true, "internal-links"),
  rule("SEO-SCHEMA-001", "jsonld-invalid", "structured_data", "high", true, "json-ld"),
  rule("SEO-SCHEMA-003", "organization-missing", "structured_data", "low", true, "schema-org"),
  rule("SEO-SCHEMA-004", "website-schema-missing", "structured_data", "low", true, "schema-org"),
  rule("SEO-SCHEMA-006", "breadcrumb-schema-missing", "structured_data", "low", true, "schema-org"),
  rule("SEO-JS-001", "important-content-only-rendered", "javascript_seo", "medium", true, "javascript-seo"),
  rule("SEO-MEDIA-001", "missing-alt-text", "media_seo", "medium", true, "image-alt"),
  rule("SEO-MEDIA-005", "missing-width-height", "media_seo", "low", true, "image-dimensions"),
  rule("SEO-PERF-010", "missing-cache-headers", "performance_seo", "low", true, "http-headers"),
  rule("SEO-PERF-011", "missing-compression", "performance_seo", "low", true, "http-headers"),
  rule(
    "SEO-PERF-020",
    "javascript-budget-exceeded",
    "performance_seo",
    "medium",
    true,
    "performance-budgets"
  ),
  rule(
    "SEO-PERF-021",
    "third-party-javascript-budget-exceeded",
    "performance_seo",
    "medium",
    true,
    "performance-budgets"
  ),
  rule(
    "SEO-PERF-022",
    "render-blocking-request-budget-exceeded",
    "performance_seo",
    "low",
    true,
    "performance-budgets"
  ),
  rule("SEO-PERF-023", "request-budget-exceeded", "performance_seo", "low", true, "performance-budgets"),
  rule(
    "SEO-PERF-024",
    "document-fetch-budget-exceeded",
    "performance_seo",
    "medium",
    true,
    "performance-budgets"
  ),
  rule("SEO-A11Y-002", "heading-order-invalid", "accessibility", "low", true, "wcag-headings"),
  rule("SEO-A11Y-006", "image-alt-missing", "accessibility", "medium", true, "wcag-images"),
  rule("SEO-A11Y-010", "skip-link-missing", "accessibility", "low", true, "wcag-navigation"),
  rule("SEO-INTL-005", "x-default-missing", "international_seo", "low", true, "hreflang"),
  rule("SEO-LOCAL-001", "nap-missing", "local_seo", "medium", true, "local-seo"),
  rule("SEO-LOCAL-003", "localbusiness-schema-missing", "local_seo", "medium", true, "local-seo"),
  rule("SEO-ECOM-001", "product-schema-missing", "ecommerce_seo", "high", true, "ecommerce-seo"),
  rule("SEO-ECOM-002", "offer-schema-missing", "ecommerce_seo", "medium", true, "ecommerce-seo"),
  rule("AR-ROBOTS-003", "sitemap-directive-missing", "agent_readiness", "medium", true, "robots-txt"),
  rule("AR-ROBOTS-004", "ai-policy-not-explicit", "policy", "info", true, "content-signals"),
  rule("AR-ROBOTS-006", "private-area-not-blocked", "security", "medium", true, "robots-txt"),
  rule("AR-LLMS-001", "llms-missing", "agent_readiness", "high", true, "llms-txt"),
  rule("AR-LLMS-003", "llms-invalid-content-type", "agent_readiness", "low", true, "llms-txt"),
  rule("AR-LLMS-008", "llms-contains-private-url", "security", "critical", true, "llms-txt"),
  rule("AR-MD-001", "markdown-negotiation-missing", "agent_readiness", "low", true, "markdown-negotiation"),
  rule("AR-SKILL-001", "agent-skills-index-missing", "protocol_discovery", "low", true, "agent-skills"),
  rule("AR-SKILL-002", "agent-skills-index-invalid", "protocol_discovery", "medium", true, "agent-skills"),
  rule("AR-MCP-001", "mcp-discovery-missing", "protocol_discovery", "low", true, "mcp"),
  rule("AR-MCP-002", "mcp-server-card-invalid", "protocol_discovery", "medium", true, "mcp"),
  rule("AR-MCP-005", "mcp-mutating-tool-without-approval", "api_auth_mcp", "critical", true, "mcp"),
  rule("AR-API-001", "api-catalog-missing", "api_auth_mcp", "low", true, "api-catalog"),
  rule("AR-API-002", "api-catalog-invalid", "api_auth_mcp", "medium", true, "api-catalog"),
  rule("AR-API-003", "openapi-missing", "api_auth_mcp", "high", true, "openapi"),
  rule("AR-AUTH-001", "auth-md-missing", "api_auth_mcp", "info", true, "auth-discovery"),
  rule("AR-AUTH-002", "oauth-authorization-server-metadata-missing", "api_auth_mcp", "info", true, "oauth"),
  rule("AR-AUTH-003", "oauth-protected-resource-metadata-missing", "api_auth_mcp", "info", true, "oauth"),
  rule(
    "SEO-SEARCH-001",
    "google-search-console-not-connected",
    "protocol_discovery",
    "info",
    true,
    "search-integrations"
  ),
  rule(
    "SEO-SEARCH-002",
    "bing-webmaster-tools-not-connected",
    "protocol_discovery",
    "info",
    true,
    "search-integrations"
  ),
  rule("SEO-PERF-001", "poor-lcp", "performance_seo", "medium", true, "core-web-vitals"),
  rule("SEO-INTL-001", "hreflang-missing", "international_seo", "low", true, "hreflang"),
  rule("SEO-LOCAL-004", "opening-hours-missing", "local_seo", "low", true, "local-seo"),
  rule("SEO-ECOM-013", "return-policy-missing", "ecommerce_seo", "low", true, "ecommerce-seo")
];

function rule(
  id: string,
  slug: string,
  category: FindingCategory,
  defaultSeverity: Severity,
  implemented: boolean,
  standard: string
): RuleDefinition {
  return { id, slug, category, defaultSeverity, implemented, standard, maturity: maturityForRule(id) };
}

function maturityForRule(id: string): RuleMaturity {
  if (/^(AR-(LLMS|MD|SKILL|MCP|API)|SEO-SEARCH)-/.test(id)) {
    return "experimental";
  }
  if (id.startsWith("AR-")) {
    return "emerging";
  }
  return "stable";
}

export function getRule(id: string): RuleDefinition {
  const match = RULE_CATALOG.find((item) => item.id === id);
  if (!match) {
    throw new Error(`Unknown rule: ${id}`);
  }
  return match;
}

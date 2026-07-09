import { describe, expect, it } from "vitest";
import type { PageSnapshot, ScanResult } from "@seo-polish/schemas";
import { evaluateRules } from "./evaluate.js";

describe("advanced rule evaluation", () => {
  it("detects redirect-chain and international metadata gaps from preserved evidence", () => {
    const first = page("https://example.com/en");
    first.redirectChain = [
      { url: "https://example.com/a", status: 301, location: "https://example.com/b" },
      { url: "https://example.com/b", status: 302, location: "https://example.com/c" },
      { url: "https://example.com/c", status: 302, location: first.finalUrl }
    ];
    first.hreflang = ["https://example.com/de"];
    first.hreflangEntries = [{ language: "de", href: "https://example.com/de" }];
    const findings = evaluateRules(scan([first, page("https://example.com/about")], "content"));

    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["SEO-TECH-002", "SEO-INTL-005", "SEO-INTL-001"])
    );
  });

  it("keeps owner-controlled local and commerce facts approval-gated", () => {
    const local = page("https://example.com/location");
    local.bodyExcerpt = "Example Company, 1 Example Street, phone 123456789";
    local.jsonLd = [jsonLd("LocalBusiness", { "@type": "LocalBusiness" })];
    const localFinding = evaluateRules(scan([local], "local-business")).find(
      (finding) => finding.id === "SEO-LOCAL-004"
    );
    expect(localFinding?.approvalRequired).toBe(true);

    const product = page("https://example.com/product/widget");
    product.jsonLd = [jsonLd("Product", { "@type": ["Product", "Offer"] })];
    const returnFinding = evaluateRules(scan([product], "commerce")).find(
      (finding) => finding.id === "SEO-ECOM-013"
    );
    expect(returnFinding?.approvalRequired).toBe(true);
  });

  it("emits poor LCP only from measured failed performance evidence", () => {
    const input = scan([page("https://example.com")], "content");
    input.performance = {
      generatedAt: "2026-07-09T00:00:00.000Z",
      budgets: { lcpMs: 2500 },
      profiles: [{ id: "browser", label: "Browser", runs: 1, reliability: "browser_lab" }],
      metrics: [
        {
          id: "lcp-ms",
          label: "Largest Contentful Paint",
          value: 3200,
          unit: "ms",
          budget: 2500,
          status: "failed",
          reliability: "browser_lab",
          evidence: ["browser"]
        }
      ],
      resources: [],
      fetchTimings: [],
      summary: {
        totalRequests: 0,
        sameOriginRequests: 0,
        thirdPartyRequests: 0,
        renderBlockingRequests: 0,
        totalJsKb: 0,
        thirdPartyJsKb: 0,
        totalCssKb: 0,
        imageBytesKb: 0,
        medianDocumentFetchMs: null,
        p95DocumentFetchMs: null
      },
      limitations: []
    };

    expect(evaluateRules(input).find((finding) => finding.id === "SEO-PERF-001")?.evidence[0]?.type).toBe(
      "performance_metric"
    );
  });
});

function scan(pages: PageSnapshot[], siteType: ScanResult["siteType"]): ScanResult {
  return {
    scanId: "scan_rule_test",
    startedAt: "2026-07-09T00:00:00.000Z",
    completedAt: "2026-07-09T00:00:01.000Z",
    config: {
      url: pages[0]?.url ?? "https://example.com",
      siteType,
      maxPages: 10,
      maxDepth: 2,
      renderJs: "auto",
      respectRobotsTxt: true,
      userAgent: "test",
      timeoutMs: 1_000,
      concurrency: 1,
      includeScreenshots: false,
      includeCoreWebVitals: true,
      includeBrowserEvidence: false,
      includeAccessibility: true,
      includeCommerce: true,
      includeInternationalSeo: true,
      includeLocalSeo: true,
      includeExperimentalStandards: true,
      includeAgentReadiness: false,
      includeSearchIntegrations: false,
      fieldDataProviders: [],
      outputDir: "report",
      policy: {
        search: "yes",
        aiInput: "ask",
        aiTrain: "ask",
        mcpMutations: "disabled",
        commerceActions: "disabled"
      }
    },
    siteType,
    framework: "unknown",
    discovery: {
      endpoints: {},
      robotsTxt: null,
      sitemapXml: null,
      sitemapUrls: [],
      llmsTxt: null,
      markdownNegotiation: null
    },
    pages,
    evidence: [],
    crawlGraph: { nodes: pages.map((item) => ({ url: item.url, depth: 0, status: 200 })), edges: [] }
  };
}

function page(url: string): PageSnapshot {
  return {
    url,
    status: 200,
    finalUrl: url,
    contentType: "text/html",
    headers: { "cache-control": "public, max-age=60", "content-encoding": "br" },
    title: "Complete example page title",
    metaDescription: "A complete example description.",
    robotsMeta: null,
    canonical: url,
    hreflang: [],
    hreflangEntries: [],
    lang: "en",
    viewport: "width=device-width, initial-scale=1",
    headings: [{ level: 1, text: "Example" }],
    wordCount: 200,
    internalLinks: ["https://example.com/about"],
    externalLinks: [],
    images: [],
    jsonLd: [jsonLd("Organization", { "@type": ["Organization", "WebSite"] })],
    openGraph: { "og:title": "Example" },
    twitterCards: { "twitter:card": "summary" },
    hasSkipLink: true,
    forms: 0,
    bodyExcerpt: "A complete example page with sufficient useful public content."
  };
}

function jsonLd(type: string, parsed: unknown): PageSnapshot["jsonLd"][number] {
  return { raw: JSON.stringify(parsed), parsed, parseError: null, types: [type] };
}

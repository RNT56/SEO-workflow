import type { ScanConfig } from "@seo-polish/schemas";

export const DEFAULT_CONFIG: Omit<ScanConfig, "url"> = {
  siteType: "auto",
  maxPages: 50,
  maxDepth: 3,
  renderJs: "auto",
  respectRobotsTxt: true,
  userAgent: "SEO-Polish/0.1 (+https://github.com/RNT56/SEO-workflow)",
  timeoutMs: 10000,
  concurrency: 4,
  includeScreenshots: false,
  includeCoreWebVitals: false,
  includeBrowserEvidence: false,
  includeAccessibility: true,
  includeCommerce: true,
  includeInternationalSeo: true,
  includeLocalSeo: true,
  includeExperimentalStandards: true,
  includeAgentReadiness: true,
  includeSearchIntegrations: false,
  outputDir: "seo-polish-report",
  performanceRuns: 2,
  performanceBudgets: {
    lcpMs: 2500,
    inpMs: 200,
    cls: 0.1,
    ttfbMs: 800,
    documentFetchMs: 1200,
    totalJsKb: 250,
    thirdPartyJsKb: 120,
    totalCssKb: 100,
    imageBytesKb: 1000,
    renderBlockingRequests: 6,
    totalRequests: 80
  },
  policy: {
    search: "yes",
    aiInput: "ask",
    aiTrain: "ask",
    mcpMutations: "disabled",
    commerceActions: "disabled"
  }
};

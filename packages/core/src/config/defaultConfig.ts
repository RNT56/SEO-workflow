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
  includeAccessibility: true,
  includeCommerce: true,
  includeInternationalSeo: true,
  includeLocalSeo: true,
  includeExperimentalStandards: true,
  includeAgentReadiness: true,
  includeSearchIntegrations: false,
  outputDir: "seo-polish-report",
  policy: {
    search: "yes",
    aiInput: "ask",
    aiTrain: "ask",
    mcpMutations: "disabled",
    commerceActions: "disabled"
  }
};

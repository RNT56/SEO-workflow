import { describe, expect, it } from "vitest";
import type { Finding, RemediationPlan, ScanConfig } from "@seo-polish/schemas";
import { generatePatchBundle } from "./index.js";

describe("generatePatchBundle", () => {
  it("groups repeated manual actions with an instance count", () => {
    const bundle = generatePatchBundle(
      config,
      [makeFinding("https://example.com/"), makeFinding("https://example.com/about")],
      plan
    );

    expect(bundle.manualActions).toEqual([
      "SEO-INDEX-004: Confirm canonical strategy before changing metadata. (2 instances)"
    ]);
  });
});

const config: ScanConfig = {
  url: "https://example.com",
  siteType: "content",
  maxPages: 10,
  maxDepth: 2,
  renderJs: "auto",
  respectRobotsTxt: true,
  userAgent: "seo-polish-test",
  timeoutMs: 1000,
  concurrency: 1,
  includeScreenshots: false,
  includeCoreWebVitals: false,
  includeBrowserEvidence: false,
  includeAccessibility: false,
  includeCommerce: false,
  includeInternationalSeo: false,
  includeLocalSeo: false,
  includeExperimentalStandards: false,
  includeAgentReadiness: true,
  includeSearchIntegrations: false,
  fieldDataProviders: [],
  outputDir: "seo-polish-report",
  policy: {
    search: "yes",
    aiInput: "ask",
    aiTrain: "ask",
    mcpMutations: "disabled",
    commerceActions: "disabled"
  }
};

const plan: RemediationPlan = {
  phases: [],
  safeFixes: [],
  approvalRequired: [],
  manualRecommendations: [],
  userDecisions: []
};

function makeFinding(url: string): Finding {
  return {
    id: "SEO-INDEX-004",
    title: "Canonical URL is not self-referencing",
    category: "indexability",
    severity: "medium",
    confidence: 90,
    status: "open",
    impact: "Search engines may consolidate the wrong URL.",
    rootCause: "Canonical target differs from the crawled URL.",
    evidence: [
      {
        id: `ev-canonical-${url}`,
        type: "html_selector",
        url,
        selector: "link[rel=canonical]",
        timestamp: "2026-07-06T00:00:00.000Z"
      }
    ],
    affectedUrls: [url],
    affectedTemplates: ["root layout"],
    recommendation: "Confirm canonical strategy before changing metadata.",
    remediation: [],
    safeToAutoFix: false,
    approvalRequired: true,
    validation: ["seo-polish validate --check canonical"]
  };
}

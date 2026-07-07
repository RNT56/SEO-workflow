import { describe, expect, it } from "vitest";
import type { Finding, RemediationOption, ReportBundle } from "@seo-polish/schemas";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { renderMarkdownReport } from "./renderMarkdownReport.js";

describe("report signal rendering", () => {
  it("groups repeated findings and keeps validation noise out of human reports", () => {
    const bundle = makeBundle();

    const markdown = renderMarkdownReport(bundle);
    expect(markdown).toContain("Unique grouped issues: 1");
    expect(markdown).toContain("SEO-INDEX-004 - Canonical URL is not self-referencing (2 instances)");
    expect(markdown).toContain("Passed/not-applicable checks omitted: 2");
    expect(markdown).not.toContain("Passed detail that should stay in validation.json");

    const html = renderHtmlReport(bundle);
    expect(html).toContain('data-filter="info"');
    expect(html).toContain('data-view-tab="overview"');
    expect(html).toContain('data-view-tab="review"');
    expect(html).toContain('data-view-tab="implementation"');
    expect(html).toContain('data-view-tab="performance"');
    expect(html).toContain('data-view-tab="templates"');
    expect(html).toContain('data-view-tab="comparison"');
    expect(html).toContain('data-view-tab="evidence"');
    expect(html).toContain('data-queue-filter="owner"');
    expect(html).toContain('data-queue-filter="fixClass"');
    expect(html).toContain('data-queue-filter="readiness"');
    expect(html).toContain('data-queue-filter="approval"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('class="score-ring large"');
    expect(html).toContain("Finding distribution");
    expect(html).toContain("Score model");
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Agent Review Status");
    expect(html).toContain("Production readiness is blocked");
    expect(html).toContain("Implementation Queue");
    expect(html).toContain("Impact vs Effort");
    expect(html).toContain("Grouped Evidence Drawers");
    expect(html).toContain("function copyText");
    expect(html).toContain("document.execCommand('copy')");
    expect(html).toContain("Passed/not-applicable checks omitted: 2");
    expect(html).toContain("evidence-drawer");
    expect(html).not.toContain("Passed detail that should stay in validation.json");
    expect(html.match(/data-finding-card/g) ?? []).toHaveLength(3);
    expect(html.match(/id="validation-[^"]+"/g) ?? []).toHaveLength(2);
  });
});

const canonicalFix: RemediationOption = {
  id: "fix-canonical",
  findingId: "SEO-INDEX-004",
  title: "Confirm canonical strategy",
  fixClass: "approval_required",
  effort: "medium",
  risk: "high",
  implementationPath: "Change canonical metadata only after owner approval.",
  validation: ["seo-polish validate --check canonical"]
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
    remediation: [canonicalFix],
    safeToAutoFix: false,
    approvalRequired: true,
    validation: ["seo-polish validate --check canonical"]
  };
}

function makeBundle(): ReportBundle {
  return {
    scan: {
      scanId: "scan_test",
      startedAt: "2026-07-06T00:00:00.000Z",
      completedAt: "2026-07-06T00:00:01.000Z",
      config: {
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
      },
      siteType: "content",
      framework: "unknown",
      discovery: {
        endpoints: {},
        robotsTxt: null,
        sitemapXml: null,
        sitemapUrls: [],
        llmsTxt: null,
        markdownNegotiation: null
      },
      pages: [],
      evidence: [],
      crawlGraph: { nodes: [], edges: [] }
    },
    findings: [makeFinding("https://example.com/"), makeFinding("https://example.com/about")],
    score: {
      total: 72,
      level: "medium",
      scores: {
        seo: 65,
        agentReadiness: 73,
        technicalHealth: 80,
        contentQuality: 70,
        performanceAccessibility: 75,
        securityPolicy: 90
      },
      categories: [
        {
          id: "combined",
          label: "Combined SEO Polish Score",
          score: 72,
          maxScore: 100,
          status: "medium",
          notes: "Test score"
        }
      ]
    },
    remediationPlan: {
      phases: [
        {
          id: "user_decision_required",
          title: "User decision required",
          summary: "Approval-required policy and canonical decisions.",
          items: [canonicalFix, { ...canonicalFix, id: "fix-canonical-copy" }]
        }
      ],
      safeFixes: [],
      approvalRequired: [canonicalFix, { ...canonicalFix, id: "fix-canonical-copy" }],
      manualRecommendations: [],
      userDecisions: [
        {
          id: "canonical-strategy",
          title: "Confirm canonical strategy",
          reason: "Canonical changes can affect indexation.",
          options: ["yes", "no", "ask-later"],
          default: "ask-later"
        }
      ]
    },
    validation: {
      ok: true,
      generatedAt: "2026-07-06T00:00:00.000Z",
      checks: [
        {
          id: "report.passed",
          title: "Passed report detail",
          status: "passed",
          message: "Passed detail that should stay in validation.json",
          severity: "info"
        },
        {
          id: "report.not-applicable",
          title: "Not applicable detail",
          status: "not_applicable",
          message: "Not applicable detail that should stay in validation.json",
          severity: "info"
        },
        {
          id: "report.warning",
          title: "Actionable report warning",
          status: "warning",
          message: "This warning should stay visible.",
          severity: "warning"
        }
      ]
    },
    patchDiff: ""
  };
}

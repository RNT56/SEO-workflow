import { describe, expect, it } from "vitest";
import { validateAgentReview, validateAgentReviewInput } from "@seo-polish/schemas";
import type { Finding, RemediationOption, ReportBundle } from "@seo-polish/schemas";
import { buildReportDashboard } from "./buildReportDashboard.js";
import { buildAgentReviewInput, buildFixtureAgentReview, buildPendingAgentReview } from "./agentReview.js";

describe("agent review artifacts", () => {
  it("builds a bounded deterministic review input packet", () => {
    const bundle = makeBundle();
    const dashboard = buildReportDashboard(bundle);
    const first = buildAgentReviewInput(bundle, dashboard);
    const second = buildAgentReviewInput(bundle, dashboard);

    expect(first.topFindings.map((item) => item.id)).toEqual(second.topFindings.map((item) => item.id));
    expect(first.implementationQueue.length).toBeLessThanOrEqual(80);
    expect(first.sourceArtifacts).toContain("findings.json");
    expect(first.sourceArtifacts).toContain("report-dashboard.json");
    expect(validateAgentReviewInput(first).ok).toBe(true);
  });

  it("validates completed fixture review and leaves pending review incomplete", () => {
    const bundle = makeBundle();
    const dashboard = buildReportDashboard(bundle);
    const fixtureReview = buildFixtureAgentReview(bundle, dashboard);
    const pendingReview = buildPendingAgentReview(bundle);

    expect(fixtureReview.status).toBe("complete");
    expect(validateAgentReview(fixtureReview).ok).toBe(true);
    expect(pendingReview.status).toBe("pending");
    expect(validateAgentReview(pendingReview).ok).toBe(true);
  });
});

const fix: RemediationOption = {
  id: "fix-title",
  findingId: "SEO-TITLE-001",
  title: "Improve title",
  fixClass: "safe_auto_fix",
  effort: "small",
  risk: "low",
  implementationPath: "src/routes/+page.svelte",
  validation: ["seo-polish validate --check title"]
};

function makeFinding(): Finding {
  return {
    id: "SEO-TITLE-001",
    title: "Title is too generic",
    category: "onpage_seo",
    severity: "high",
    confidence: 90,
    status: "open",
    impact: "The page may underperform for relevant search intent.",
    rootCause: "The source template emits a generic title.",
    evidence: [
      {
        id: "ev-title",
        type: "html_selector",
        url: "https://example.com/",
        selector: "title",
        timestamp: "2026-07-07T00:00:00.000Z"
      }
    ],
    affectedUrls: ["https://example.com/"],
    affectedTemplates: ["Home page"],
    recommendation: "Write a title that reflects the page topic.",
    remediation: [fix],
    safeToAutoFix: true,
    approvalRequired: false,
    validation: fix.validation,
    actionability: {
      owner: "content",
      automationReadiness: "auto",
      sourceLocations: ["src/routes/+page.svelte"],
      repoEvidence: [],
      expectedImpact: "high",
      nextStep: "Update the home page title source.",
      blockers: []
    }
  };
}

function makeBundle(): ReportBundle {
  const finding = makeFinding();
  return {
    scan: {
      scanId: "scan_test",
      startedAt: "2026-07-07T00:00:00.000Z",
      completedAt: "2026-07-07T00:00:01.000Z",
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
      framework: "svelte",
      discovery: {
        endpoints: {},
        robotsTxt: null,
        sitemapXml: null,
        sitemapUrls: [],
        llmsTxt: null,
        markdownNegotiation: null
      },
      pages: [],
      evidence: finding.evidence,
      crawlGraph: { nodes: [], edges: [] }
    },
    findings: [finding],
    score: {
      total: 82,
      level: "strong",
      scores: {
        seo: 80,
        agentReadiness: 78,
        technicalHealth: 90,
        contentQuality: 75,
        performanceAccessibility: 82,
        securityPolicy: 95
      },
      categories: [
        {
          id: "combined",
          label: "Combined SEO Polish Score",
          score: 82,
          maxScore: 100,
          status: "strong",
          notes: "Test score"
        }
      ]
    },
    remediationPlan: {
      phases: [{ id: "safe", title: "Safe fixes", summary: "Safe fixes.", items: [fix] }],
      safeFixes: [fix],
      approvalRequired: [],
      manualRecommendations: [],
      userDecisions: []
    },
    validation: {
      ok: true,
      generatedAt: "2026-07-07T00:00:00.000Z",
      checks: []
    },
    patchDiff: ""
  };
}

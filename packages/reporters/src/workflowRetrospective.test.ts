import { validateWorkflowRetrospective, validateWorkflowRetrospectiveInput } from "@seo-polish/schemas";
import type { Finding, RemediationOption, ReportBundle } from "@seo-polish/schemas";
import { describe, expect, it } from "vitest";
import { buildFixtureAgentReview } from "./agentReview.js";
import { buildReportDashboard } from "./buildReportDashboard.js";
import {
  buildFixtureWorkflowRetrospective,
  buildPendingWorkflowRetrospective,
  buildWorkflowRetrospectiveInput
} from "./workflowRetrospective.js";

describe("workflow retrospective artifacts", () => {
  it("builds a bounded deterministic retrospective input packet", () => {
    const bundle = makeBundle();
    const dashboard = buildReportDashboard(bundle);
    const review = buildFixtureAgentReview(bundle, dashboard);
    const first = buildWorkflowRetrospectiveInput(bundle, dashboard, review);
    const second = buildWorkflowRetrospectiveInput(bundle, dashboard, review);

    expect(first.topFindings.map((item) => item.id)).toEqual(second.topFindings.map((item) => item.id));
    expect(first.dashboardQueues.implementationQueue.length).toBeLessThanOrEqual(80);
    expect(first.sourceArtifacts).toContain("agent-review.json");
    expect(first.artifactInventory).toContain("workflow-retrospective.json");
    expect(validateWorkflowRetrospectiveInput(first).ok).toBe(true);
  });

  it("validates completed fixture retrospective and leaves pending retrospective incomplete", () => {
    const bundle = makeBundle();
    const dashboard = buildReportDashboard(bundle);
    const review = buildFixtureAgentReview(bundle, dashboard);
    const fixture = buildFixtureWorkflowRetrospective(bundle, dashboard, review);
    const pending = buildPendingWorkflowRetrospective(bundle);

    expect(fixture.status).toBe("complete");
    expect(validateWorkflowRetrospective(fixture).ok).toBe(true);
    expect(pending.status).toBe("pending");
    expect(validateWorkflowRetrospective(pending).ok).toBe(true);
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
      framework: "sveltekit",
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
      crawlGraph: { nodes: [], edges: [] },
      routeTemplates: []
    },
    findings: [finding],
    score: {
      total: 82,
      level: "strong",
      scores: {
        seo: 80,
        agentReadiness: 80,
        technicalHealth: 80,
        contentQuality: 80,
        performanceAccessibility: 80,
        securityPolicy: 80
      },
      categories: []
    },
    remediationPlan: {
      phases: [{ id: "phase-1", title: "Phase 1", summary: "Fix basics.", items: [fix] }],
      safeFixes: [fix],
      approvalRequired: [],
      manualRecommendations: [],
      userDecisions: []
    },
    validation: {
      ok: true,
      generatedAt: "2026-07-07T00:00:02.000Z",
      checks: []
    },
    patchDiff: ""
  };
}

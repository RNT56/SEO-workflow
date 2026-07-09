import { describe, expect, it } from "vitest";
import type { BaselineComparison, Finding, RemediationOption, ReportBundle } from "@seo-polish/schemas";
import { buildReportDashboard } from "./buildReportDashboard.js";

describe("buildReportDashboard", () => {
  it("builds deterministic queues from repeated findings", () => {
    const bundle = makeBundle();
    const first = buildReportDashboard(bundle, { baselineComparison: baselineComparison() });
    const second = buildReportDashboard(bundle, { baselineComparison: baselineComparison() });

    expect(first.implementationQueue.map((item) => item.id)).toEqual(
      second.implementationQueue.map((item) => item.id)
    );
    expect(first.implementationQueue[0]).toMatchObject({
      findingId: "SEO-A11Y-006",
      owner: "content",
      fixClass: "safe_auto_fix",
      expectedImpact: "high",
      validationCommand: "seo-polish validate --check accessibility"
    });
    expect(first.approvalQueue.map((item) => item.findingId)).toContain("SEO-INDEX-004");
    expect(first.nextBestFixes.some((item) => item.approvalRequired)).toBe(false);
    expect(first.agentReview.status).toBe("pending");
  });

  it("classifies impact and effort, templates, performance and baseline summaries", () => {
    const dashboard = buildReportDashboard(makeBundle(), { baselineComparison: baselineComparison() });

    expect(dashboard.impactEffortMatrix).toHaveLength(4);
    expect(dashboard.impactEffortMatrix.find((item) => item.id === "quick_wins")?.items[0]?.findingId).toBe(
      "SEO-A11Y-006"
    );
    expect(dashboard.templateHeatmap[0]).toMatchObject({
      template: "Project template",
      issueCount: 3,
      criticalHighCount: 2
    });
    expect(dashboard.performanceSummary.metrics.find((metric) => metric.id === "lcp-ms")).toMatchObject({
      value: null,
      status: "not_measured",
      reliability: "not_measured"
    });
    expect(dashboard.baselineSummary).toMatchObject({
      status: "ok",
      scoreDelta: 8,
      newFindingGroups: ["SEO-A11Y-006"],
      resolvedFindingGroups: ["SEO-TITLE-001"],
      recurringFindingGroups: ["SEO-INDEX-004"],
      unchangedFindingGroups: ["SEO-INDEX-004"]
    });
  });

  it("uses Search Console rows to prioritize observed opportunities without creating findings", () => {
    const bundle = makeBundle();
    bundle.scan.fieldData = {
      searchConsole: {
        searchAnalytics: {
          rows: [
            {
              keys: ["https://example.com/a"],
              page: "https://example.com/a",
              clicks: 20,
              impressions: 2_000,
              ctr: 0.01,
              position: 8
            }
          ]
        }
      }
    } as NonNullable<ReportBundle["scan"]["fieldData"]>;

    const dashboard = buildReportDashboard(bundle);
    const item = dashboard.implementationQueue.find((candidate) => candidate.findingId === "SEO-A11Y-006");

    expect(item?.searchOpportunity).toMatchObject({ clicks: 20, impressions: 2_000 });
    expect(item?.priorityReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Search Console impressions")])
    );
    expect(dashboard.implementationQueue).toHaveLength(2);
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

const imageAltFix: RemediationOption = {
  id: "fix-image-alt",
  findingId: "SEO-A11Y-006",
  title: "Add meaningful image alt text",
  fixClass: "safe_auto_fix",
  effort: "small",
  risk: "low",
  implementationPath: "src/components/ProjectCard.tsx",
  validation: ["seo-polish validate --check accessibility"]
};

function makeFinding(
  id: string,
  title: string,
  severity: Finding["severity"],
  remediation: RemediationOption,
  url: string
): Finding {
  return {
    id,
    title,
    category: id === "SEO-A11Y-006" ? "accessibility" : "indexability",
    severity,
    confidence: 90,
    status: "open",
    impact: "Search and assistive technology quality can suffer.",
    rootCause: "The source template emits incomplete metadata.",
    evidence: [
      {
        id: `ev-${id}-${url}`,
        type: "html_selector",
        url,
        selector: "img",
        timestamp: "2026-07-06T00:00:00.000Z"
      }
    ],
    affectedUrls: [url],
    affectedTemplates: ["Project template"],
    recommendation: remediation.implementationPath,
    remediation: [remediation],
    safeToAutoFix: remediation.fixClass === "safe_auto_fix",
    approvalRequired: remediation.fixClass === "approval_required",
    validation: remediation.validation,
    actionability: {
      owner: id === "SEO-A11Y-006" ? "content" : "seo",
      automationReadiness: remediation.fixClass === "safe_auto_fix" ? "auto" : "approval_required",
      sourceLocations: [remediation.implementationPath],
      repoEvidence: [],
      expectedImpact: severity === "high" ? "high" : "medium",
      nextStep: remediation.implementationPath,
      blockers: remediation.fixClass === "approval_required" ? ["owner approval"] : []
    }
  };
}

function makeBundle(): ReportBundle {
  const findings = [
    makeFinding("SEO-A11Y-006", "Image alt text missing", "high", imageAltFix, "https://example.com/a"),
    makeFinding("SEO-A11Y-006", "Image alt text missing", "high", imageAltFix, "https://example.com/b"),
    makeFinding(
      "SEO-INDEX-004",
      "Canonical URL is not self-referencing",
      "medium",
      canonicalFix,
      "https://example.com/a"
    )
  ];
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
      crawlGraph: { nodes: [], edges: [] },
      routeTemplates: [
        {
          id: "template-1",
          label: "Project template",
          urlPattern: "/project/:slug",
          representativeUrl: "https://example.com/a",
          urls: ["https://example.com/a", "https://example.com/b"],
          pageCount: 2,
          signals: ["path"],
          sourceCandidates: ["src/routes/project.tsx"]
        }
      ],
      performance: {
        generatedAt: "2026-07-06T00:00:00.000Z",
        budgets: { totalJsKb: 100 },
        profiles: [{ id: "http-fetch", label: "HTTP fetch", runs: 2, reliability: "fetch_lab" }],
        metrics: [
          {
            id: "lcp-ms",
            label: "Largest Contentful Paint",
            value: null,
            unit: "ms",
            status: "not_measured",
            reliability: "not_measured",
            evidence: ["Browser evidence not collected."]
          },
          {
            id: "total-js-kb",
            label: "JavaScript transfer",
            value: 120,
            unit: "kb",
            budget: 100,
            status: "failed",
            reliability: "fetch_lab",
            evidence: ["Known script bytes."]
          }
        ],
        resources: [
          {
            url: "https://cdn.example.com/app.js",
            type: "script",
            sameOrigin: false,
            thirdParty: true,
            renderBlocking: true,
            async: false,
            defer: false,
            lazy: false,
            discoveredIn: "head",
            bytes: 122880,
            totalMs: 80
          }
        ],
        fetchTimings: [
          {
            url: "https://example.com/",
            finalUrl: "https://example.com/",
            status: 200,
            ok: true,
            startedAt: "2026-07-06T00:00:00.000Z",
            completedAt: "2026-07-06T00:00:00.120Z",
            totalMs: 120,
            bodyBytes: 1000,
            contentType: "text/html",
            run: 1,
            profile: "default"
          }
        ],
        summary: {
          totalRequests: 2,
          sameOriginRequests: 1,
          thirdPartyRequests: 1,
          renderBlockingRequests: 1,
          totalJsKb: 120,
          thirdPartyJsKb: 120,
          totalCssKb: 0,
          imageBytesKb: 0,
          medianDocumentFetchMs: 120,
          p95DocumentFetchMs: 120
        },
        limitations: ["Browser rendering evidence was not collected."]
      }
    },
    findings,
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
          id: "safe",
          title: "Safe fixes",
          summary: "Safe implementation queue.",
          items: [imageAltFix]
        },
        {
          id: "approval",
          title: "Approval required",
          summary: "Owner decisions.",
          items: [canonicalFix]
        }
      ],
      safeFixes: [imageAltFix],
      approvalRequired: [canonicalFix],
      manualRecommendations: [],
      userDecisions: []
    },
    validation: {
      ok: true,
      generatedAt: "2026-07-06T00:00:00.000Z",
      checks: []
    },
    patchDiff: ""
  };
}

function baselineComparison(): BaselineComparison {
  return {
    generatedAt: "2026-07-06T00:00:00.000Z",
    status: "ok",
    baselinePath: "previous-report",
    scoreDelta: 8,
    newFindingGroups: ["SEO-A11Y-006"],
    resolvedFindingGroups: ["SEO-TITLE-001"],
    recurringFindingGroups: ["SEO-INDEX-004"],
    performanceDeltas: { "total-js-kb": -20 },
    notes: ["Positive scoreDelta means the current scan scored higher than the baseline."]
  };
}

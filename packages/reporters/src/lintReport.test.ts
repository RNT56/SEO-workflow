import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_SECTIONS, REQUIRED_REPORT_FILES, sectionHeading } from "@seo-polish/schemas";
import type { Finding, RemediationOption, ReportBundle } from "@seo-polish/schemas";
import { buildFixtureAgentReview } from "./agentReview.js";
import { buildReportDashboard } from "./buildReportDashboard.js";
import { lintReport } from "./lintReport.js";
import { writeReportBundle } from "./writeReport.js";

describe("report linter", () => {
  it("fails missing required files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seo-polish-lint-"));
    await writeFile(join(dir, "index.md"), REPORT_SECTIONS.map(sectionHeading).join("\n"), "utf8");
    const result = await lintReport(dir, { strict: true });
    expect(result.ok).toBe(false);
  });

  it("fails strict lint while agent review is pending and passes with a completed fixture review", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seo-polish-lint-review-"));
    const bundle = makeBundle();

    await writeReportBundle(dir, bundle);
    await writeMissingRequiredFiles(dir);
    await writeFile(
      join(dir, "field-data.json"),
      JSON.stringify({ status: "disabled", providersRequested: [] }),
      "utf8"
    );

    const pending = await lintReport(dir, { strict: true });
    expect(pending.ok).toBe(false);
    expect(pending.checks.find((check) => check.id === "agent-review.complete")?.status).toBe("failed");

    const dashboard = buildReportDashboard(bundle);
    await writeReportBundle(dir, bundle, { agentReview: buildFixtureAgentReview(bundle, dashboard) });
    await writeMissingRequiredFiles(dir);
    await writeFile(
      join(dir, "field-data.json"),
      JSON.stringify({ status: "disabled", providersRequested: [] }),
      "utf8"
    );

    const complete = await lintReport(dir, { strict: true });
    expect(complete.ok).toBe(true);
  });
});

async function writeMissingRequiredFiles(dir: string): Promise<void> {
  for (const file of REQUIRED_REPORT_FILES) {
    const path = join(dir, file);
    try {
      await access(path);
      continue;
    } catch {
      await writeFile(path, placeholderContent(file), "utf8");
    }
  }
}

function placeholderContent(file: string): string {
  if (file.endsWith(".json")) return "{}\n";
  if (file.endsWith(".jsonl") || file.endsWith(".csv") || file.endsWith(".diff")) return "";
  if (file.endsWith(".svg")) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';
  if (file.endsWith(".html")) return "<!doctype html><html><body></body></html>\n";
  return "# Placeholder\n";
}

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
      ],
      profiles: {
        core_seo: {
          id: "core_seo",
          label: "Core SEO Health",
          score: 82,
          level: "strong",
          maturity: "stable",
          includedInPrimary: true,
          coverage: testCoverage(),
          notes: "Test coverage"
        },
        experience: {
          id: "experience",
          label: "Performance & Accessibility",
          score: 82,
          level: "strong",
          maturity: "stable",
          includedInPrimary: true,
          coverage: testCoverage(),
          notes: "Test coverage"
        },
        agent_readiness: {
          id: "agent_readiness",
          label: "Agent Readiness (Experimental)",
          score: 78,
          level: "strong",
          maturity: "experimental",
          includedInPrimary: false,
          coverage: testCoverage(),
          notes: "Test coverage"
        },
        governance: {
          id: "governance",
          label: "Security & Policy Governance",
          score: 95,
          level: "excellent",
          maturity: "emerging",
          includedInPrimary: false,
          coverage: testCoverage(),
          notes: "Test coverage"
        }
      },
      coverage: testCoverage(),
      experimentalCombined: 80
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

function testCoverage() {
  return {
    catalogRules: 1,
    applicableRules: 1,
    measuredRules: 1,
    passedRules: 0,
    failedRules: 1,
    notApplicableRules: 0,
    notMeasuredRules: 0,
    percentMeasured: 100
  };
}

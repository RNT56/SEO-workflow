import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

/* global document */

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rendererPath = join(root, "packages/reporters/dist/index.js");

if (!existsSync(rendererPath)) {
  console.log("Report UI smoke skipped: build output is missing. Run pnpm build first.");
  process.exit(0);
}

const { renderHtmlReport } = await import(pathToFileURL(rendererPath).href);
const tempDir = await mkdtemp(join(tmpdir(), "seo-polish-report-ui-"));
const fixturePath = join(tempDir, "index.html");
await writeFile(fixturePath, renderHtmlReport(makeBundle()), "utf8");

const candidateReports = [
  { path: fixturePath, required: true },
  {
    path: join(root, "packages/cli/reports/portfolio-rnt56-netlify-2026-07-06-production/index.html"),
    required: false
  }
].filter((report) => existsSync(report.path));

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Executable doesn't exist") || message.includes("playwright install")) {
    console.log("Report UI smoke skipped: Playwright browser is not installed.");
    process.exit(0);
  }
  throw error;
}

try {
  let passed = 0;
  for (const report of candidateReports) {
    if (await smokeReport(browser, report.path, report.required)) {
      passed += 1;
    }
  }
  console.log(`Report UI smoke passed for ${passed} report(s).`);
} finally {
  await browser.close();
}

async function smokeReport(browserInstance, reportPath, required) {
  const page = await browserInstance.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(pathToFileURL(reportPath).href);
  const hasCockpit = (await page.locator('[data-view-tab="implementation"]').count()) > 0;
  if (!hasCockpit) {
    await page.close();
    if (required) {
      throw new Error(`Required report is missing cockpit tabs: ${reportPath}`);
    }
    console.log(`Report UI smoke skipped legacy report without cockpit tabs: ${reportPath}`);
    return false;
  }
  await page.locator('[data-view-tab="implementation"]').click();
  await assertVisiblePanel(page, "implementation");
  await page.locator('[data-queue-filter="owner"]').selectOption("all");
  await page.locator('[data-queue-filter="fixClass"]').selectOption("all");
  await page.locator('[data-queue-filter="readiness"]').selectOption("all");
  await page.locator('[data-queue-filter="approval"]').selectOption("all");
  await assertCopyTargets(page);
  await page.locator("details summary").first().click();
  await page.locator('[data-view-tab="performance"]').click();
  await assertVisiblePanel(page, "performance");
  await page.locator('[data-view-tab="templates"]').click();
  await assertVisiblePanel(page, "templates");
  await page.goto(`${pathToFileURL(reportPath).href}#section-1`);
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 840 });
  await assertNoHorizontalOverflow(page);
  await page.close();
  return true;
}

async function assertVisiblePanel(page, panel) {
  const visible = await page.locator(`[data-view-panel="${panel}"]`).evaluate((element) => !element.hidden);
  if (!visible) {
    throw new Error(`Expected ${panel} panel to be visible.`);
  }
}

async function assertCopyTargets(page) {
  const missingTargets = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-copy]"))
      .map((button) => button.getAttribute("data-copy"))
      .filter((target) => target && !document.getElementById(target))
  );
  if (missingTargets.length > 0) {
    throw new Error(`Missing copy targets: ${missingTargets.join(", ")}`);
  }
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow > 2) {
    throw new Error(`Unexpected horizontal overflow: ${overflow}px`);
  }
}

function makeBundle() {
  const safeFix = {
    id: "fix-alt",
    findingId: "SEO-A11Y-006",
    title: "Add image alt text",
    fixClass: "safe_auto_fix",
    effort: "small",
    risk: "low",
    implementationPath: "src/components/Card.tsx",
    validation: ["seo-polish validate --check accessibility"]
  };
  const approvalFix = {
    id: "fix-canonical",
    findingId: "SEO-INDEX-004",
    title: "Confirm canonical strategy",
    fixClass: "approval_required",
    effort: "medium",
    risk: "high",
    implementationPath: "src/app/layout.tsx",
    validation: ["seo-polish validate --check canonical"]
  };
  const finding = (id, title, category, severity, fix, approvalRequired) => ({
    id,
    title,
    category,
    severity,
    confidence: 90,
    status: "open",
    impact: "The page can underperform in search or assistive contexts.",
    rootCause: "The source template omits a required signal.",
    evidence: [
      {
        id: `ev-${id}`,
        type: "html_selector",
        url: "https://example.com/",
        selector: "head",
        timestamp: "2026-07-06T00:00:00.000Z"
      }
    ],
    affectedUrls: ["https://example.com/"],
    affectedTemplates: ["Home template"],
    recommendation: fix.implementationPath,
    remediation: [fix],
    safeToAutoFix: !approvalRequired,
    approvalRequired,
    validation: fix.validation,
    actionability: {
      owner: approvalRequired ? "seo" : "content",
      automationReadiness: approvalRequired ? "approval_required" : "auto",
      sourceLocations: [fix.implementationPath],
      repoEvidence: [],
      expectedImpact: approvalRequired ? "medium" : "high",
      nextStep: fix.implementationPath,
      blockers: approvalRequired ? ["owner approval"] : []
    }
  });

  return {
    scan: {
      scanId: "scan_ui",
      startedAt: "2026-07-06T00:00:00.000Z",
      completedAt: "2026-07-06T00:00:01.000Z",
      config: {
        url: "https://example.com",
        siteType: "content",
        maxPages: 10,
        maxDepth: 2,
        renderJs: "auto",
        respectRobotsTxt: true,
        userAgent: "seo-polish-ui",
        timeoutMs: 1000,
        concurrency: 1,
        includeScreenshots: false,
        includeCoreWebVitals: false,
        includeAccessibility: true,
        includeCommerce: false,
        includeInternationalSeo: false,
        includeLocalSeo: false,
        includeExperimentalStandards: false,
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
          label: "Home template",
          urlPattern: "/",
          representativeUrl: "https://example.com/",
          urls: ["https://example.com/"],
          pageCount: 1,
          signals: ["root"],
          sourceCandidates: ["src/app/page.tsx"]
        }
      ],
      performance: {
        generatedAt: "2026-07-06T00:00:00.000Z",
        budgets: { totalJsKb: 100 },
        profiles: [{ id: "http-fetch", label: "HTTP fetch", runs: 1, reliability: "fetch_lab" }],
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
        resources: [],
        fetchTimings: [],
        summary: {
          totalRequests: 1,
          sameOriginRequests: 1,
          thirdPartyRequests: 0,
          renderBlockingRequests: 0,
          totalJsKb: 120,
          thirdPartyJsKb: 0,
          totalCssKb: 0,
          imageBytesKb: 0,
          medianDocumentFetchMs: null,
          p95DocumentFetchMs: null
        },
        limitations: ["Browser rendering evidence was not collected."]
      }
    },
    findings: [
      finding("SEO-A11Y-006", "Image alt text missing", "accessibility", "high", safeFix, false),
      finding(
        "SEO-INDEX-004",
        "Canonical URL is not self-referencing",
        "indexability",
        "medium",
        approvalFix,
        true
      )
    ],
    score: {
      total: 80,
      level: "strong",
      scores: {
        seo: 80,
        agentReadiness: 80,
        technicalHealth: 80,
        contentQuality: 80,
        performanceAccessibility: 80,
        securityPolicy: 80
      },
      categories: [
        {
          id: "combined",
          label: "Combined SEO Polish Score",
          score: 80,
          maxScore: 100,
          status: "strong",
          notes: "UI fixture"
        }
      ]
    },
    remediationPlan: {
      phases: [
        { id: "safe", title: "Safe fixes", summary: "Safe queue.", items: [safeFix] },
        { id: "approval", title: "Approval required", summary: "Owner queue.", items: [approvalFix] }
      ],
      safeFixes: [safeFix],
      approvalRequired: [approvalFix],
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

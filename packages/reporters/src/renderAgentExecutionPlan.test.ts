import { describe, expect, it } from "vitest";
import type { ReportBundle } from "@seo-polish/schemas";
import { renderAgentExecutionPlan } from "./renderAgentExecutionPlan.js";
import { renderAgentInstruction } from "./renderMarkdownReport.js";

describe("renderAgentExecutionPlan", () => {
  it("renders the final handoff contract from report and benchmark data", () => {
    const plan = renderAgentExecutionPlan(bundle, {
      benchmark: {
        score: 73,
        summary: "Agents need better public discovery.",
        metrics: [{ name: "llms_txt_available", value: 0, unit: "boolean" }]
      }
    });

    expect(plan).toContain("# Agent Execution Plan");
    expect(plan).toContain("`report-dashboard.json`");
    expect(plan).toContain("`agent-review-input.json`");
    expect(plan).toContain("Execution cockpit:");
    expect(plan).toContain("## Phase 1 - Complete Agent Review");
    expect(plan).toContain("## Phase 2 - Next Best Fixes");
    expect(plan).toContain("Publish llms.txt");
    expect(plan).toContain("## Phase 4 - Approval-Required Queue");
    expect(plan).toContain("Confirm canonical strategy");
    expect(plan).toContain("## Agent Experience Benchmark");
    expect(plan).toContain("## Agent Communication Contract");
    expect(plan).toContain("Run quietly by default");
    expect(plan).toContain("Do not narrate routine commands");
    expect(plan).toContain("Score: 73/100");
    expect(plan).toContain("## Complete Finding Queue");
    expect(plan).toContain("## Reusable Repo-Agent Prompt");
    expect(plan).toContain("seo-polish plan build --report <report-dir>");
  });

  it("renders the quiet communication contract into agent-specific instructions", () => {
    const instructions = renderAgentInstruction("codex", bundle);

    expect(instructions).toContain("## Agent Communication Contract");
    expect(instructions).toContain("Run quietly by default");
    expect(instructions).toContain("Do not narrate routine commands");
    expect(instructions).toContain("Final responses should include only");
  });
});

const safeFix = {
  id: "fix-llms",
  findingId: "AR-LLMS-001",
  title: "Publish llms.txt",
  fixClass: "safe_auto_fix" as const,
  effort: "small" as const,
  risk: "low" as const,
  implementationPath: "Create public/llms.txt from canonical public pages.",
  validation: ["seo-polish validate --check agent-readiness"]
};

const approvalFix = {
  id: "fix-canonical",
  findingId: "SEO-INDEX-004",
  title: "Confirm canonical strategy",
  fixClass: "approval_required" as const,
  effort: "medium" as const,
  risk: "high" as const,
  implementationPath: "Change canonical metadata only after owner approval.",
  validation: ["seo-polish validate --check canonical"]
};

const bundle: ReportBundle = {
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
  findings: [
    {
      id: "AR-LLMS-001",
      title: "llms.txt is missing",
      category: "agent_readiness",
      severity: "high",
      confidence: 95,
      status: "open",
      impact: "Agents lack a compact source map.",
      rootCause: "No llms.txt endpoint was found.",
      evidence: [
        {
          id: "ev-llms",
          type: "http_status",
          url: "https://example.com/llms.txt",
          status: 404,
          timestamp: "2026-07-06T00:00:00.000Z"
        }
      ],
      affectedUrls: ["https://example.com/llms.txt"],
      affectedTemplates: [],
      recommendation: "Publish llms.txt.",
      remediation: [safeFix],
      safeToAutoFix: true,
      approvalRequired: false,
      validation: ["seo-polish validate --check agent-readiness"]
    },
    {
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
          id: "ev-canonical",
          type: "html_selector",
          url: "https://example.com",
          selector: "link[rel=canonical]",
          timestamp: "2026-07-06T00:00:00.000Z"
        }
      ],
      affectedUrls: ["https://example.com"],
      affectedTemplates: ["root layout"],
      recommendation: "Confirm canonical strategy before changing metadata.",
      remediation: [approvalFix],
      safeToAutoFix: false,
      approvalRequired: true,
      validation: ["seo-polish validate --check canonical"]
    }
  ],
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
    phases: [],
    safeFixes: [safeFix],
    approvalRequired: [approvalFix],
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
        id: "report",
        title: "Report lint",
        status: "passed",
        message: "Report passed.",
        severity: "info"
      }
    ]
  },
  patchDiff: ""
};

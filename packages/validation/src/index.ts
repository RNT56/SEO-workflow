import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { lintReport } from "@seo-polish/reporters";
import type { Finding, ScanResult, ValidationCheck, ValidationResult } from "@seo-polish/schemas";
import {
  findingContainsPrivateReference,
  findPrivateReferences,
  isPrivateUrl,
  requiresApprovalForText
} from "@seo-polish/security";

export interface ValidationRunnerInput {
  reportDir: string;
  findings?: Finding[];
  strict?: boolean;
}

const RECOMMENDED_SCAN_FILES = [
  "crawl-graph.json",
  "crawl-graph.svg",
  "raw-render-diff.json",
  "response-index.json",
  "header-index.json",
  "body-excerpts.json",
  "report-dashboard.json",
  "tech-stack.json",
  "repo-analysis.json",
  "route-templates.json",
  "performance-audit.json",
  "resource-timing.json",
  "performance-runs.jsonl",
  "third-party-cost.json",
  "largest-assets.json",
  "critical-request-chain.json",
  "actionability.json",
  "baseline-comparison.json",
  "suppression-report.json",
  "quality-gate.json",
  "production-readiness.json",
  "internal-link-opportunities.json",
  "orphan-pages.csv",
  "deep-pages.csv",
  "patch.diff",
  "patch-plan.md",
  "changed-files.json",
  "framework-actions.json",
  "manual-actions.md",
  "before-after-score.json",
  "remaining-user-decisions.md",
  "priority-action-plan.md",
  "agent-execution-plan.md",
  "github-pr-comment.md",
  "executive-summary.md",
  "standards-registry.json",
  "agent-instructions/README.md",
  "agent-instructions/codex.md",
  "agent-instructions/claude-code.md",
  "agent-instructions/gemini-cli.md",
  "agent-instructions/openclaw.md",
  "agent-instructions/hermes.md"
];

export async function runValidation(input: ValidationRunnerInput): Promise<ValidationResult> {
  const lint = await lintReport(input.reportDir, input.strict === undefined ? {} : { strict: input.strict });
  const checks: ValidationCheck[] = [...lint.checks];

  const scan = await readOptionalJson<ScanResult>(join(input.reportDir, "scan-result.json"));
  const standardsSnapshot = await readOptionalJson<{
    standards?: unknown[];
    ruleMapping?: Record<string, unknown>;
    implementedRuleCount?: number;
  }>(join(input.reportDir, "standards-registry.json"));
  for (const file of RECOMMENDED_SCAN_FILES) {
    checks.push(await fileExists(input.reportDir, file, false));
  }

  if (scan) {
    checks.push(...validateScanArtifacts(scan));
  }
  if (standardsSnapshot) {
    checks.push(...validateStandardsSnapshot(standardsSnapshot));
  }

  if (input.findings) {
    for (const finding of input.findings) {
      checks.push(...validateFinding(finding));
    }
  }

  return {
    ok: checks.every((check) => check.status !== "failed"),
    generatedAt: new Date().toISOString(),
    checks
  };
}

function validateStandardsSnapshot(snapshot: {
  standards?: unknown[];
  ruleMapping?: Record<string, unknown>;
  implementedRuleCount?: number;
}): ValidationCheck[] {
  return [
    check(
      "standards.snapshot-standards",
      "Standards snapshot includes standards",
      Array.isArray(snapshot.standards) && snapshot.standards.length > 0,
      "standards-registry.json should include the standards used for this scan.",
      "warning"
    ),
    check(
      "standards.snapshot-rule-mapping",
      "Standards snapshot includes rule mapping",
      Boolean(snapshot.ruleMapping && Object.keys(snapshot.ruleMapping).length > 0),
      "standards-registry.json should include rule-to-standard mappings.",
      "warning"
    ),
    check(
      "standards.snapshot-rule-count",
      "Standards snapshot includes implemented rule count",
      typeof snapshot.implementedRuleCount === "number" && snapshot.implementedRuleCount > 0,
      "standards-registry.json should include implemented rule coverage metadata.",
      "warning"
    )
  ];
}

function validateScanArtifacts(scan: ScanResult): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const robots = scan.discovery.robotsTxt;
  const sitemap = scan.discovery.sitemapXml;
  const llms = scan.discovery.llmsTxt;

  checks.push(
    check(
      "site.pages-crawled",
      "At least one page crawled",
      scan.pages.length > 0,
      "A scan must crawl at least one public HTML page.",
      "error"
    )
  );
  checks.push(
    check(
      "site.robots-probed",
      "robots.txt probed",
      robots !== null,
      "The discovery scan must probe robots.txt.",
      "error"
    )
  );
  checks.push(
    check(
      "site.sitemap-probed",
      "sitemap.xml probed",
      sitemap !== null,
      "The discovery scan must probe sitemap.xml or sitemap_index.xml.",
      "error"
    )
  );
  checks.push(
    check(
      "site.llms-probed",
      "llms.txt probed",
      llms !== null,
      "The discovery scan must probe llms.txt.",
      "error"
    )
  );

  const sitemapPrivate = scan.discovery.sitemapUrls.filter((url) => isPrivateUrl(url));
  checks.push(
    check(
      "sitemap.no-private-urls",
      "Sitemap private URL guard",
      sitemapPrivate.length === 0,
      "sitemap.xml must not expose private, auth, checkout, token or internal API URLs.",
      "error"
    )
  );

  const llmsPrivate = llms?.bodyExcerpt ? findPrivateReferences(llms.bodyExcerpt) : [];
  checks.push(
    check(
      "llms.no-private-refs",
      "llms.txt private reference guard",
      llmsPrivate.length === 0,
      "llms.txt must not expose private paths or secret-looking values.",
      "error"
    )
  );

  const invalidJsonLd = scan.pages.flatMap((page) =>
    page.jsonLd
      .filter((item) => item.parseError)
      .map((item) => ({ page: page.finalUrl, error: item.parseError }))
  );
  checks.push(
    check(
      "jsonld.parse",
      "JSON-LD parse state",
      invalidJsonLd.length === 0,
      "All discovered JSON-LD blocks should parse successfully.",
      "warning"
    )
  );

  const invalidCanonicals = scan.pages.filter((page) => page.canonical && isPrivateUrl(page.canonical));
  checks.push(
    check(
      "canonical.no-private",
      "Canonical private URL guard",
      invalidCanonicals.length === 0,
      "Canonicals must not point to private or token-bearing URLs.",
      "error"
    )
  );

  const graphUrls = new Set(scan.crawlGraph.nodes.map((node) => node.url));
  const uncrawledInternalLinks = scan.pages.flatMap((page) =>
    page.internalLinks
      .filter((link) => !graphUrls.has(link))
      .map((link) => ({ from: page.finalUrl, to: link }))
  );
  checks.push(
    check(
      "links.internal-coverage",
      "Internal link crawl coverage",
      uncrawledInternalLinks.length === 0 || scan.pages.length >= scan.config.maxPages,
      "Internal links should be crawled unless the max-pages cap is reached.",
      "warning"
    )
  );

  for (const [path, probe] of Object.entries(scan.discovery.endpoints)) {
    if (path.endsWith(".json") || path.includes("api-catalog") || path.includes("oauth")) {
      if (probe.ok && probe.bodyExcerpt.trim().startsWith("{")) {
        checks.push(
          check(
            `well-known.${path}`,
            `${path} JSON parses`,
            parsesJson(probe.bodyExcerpt),
            `${path} should contain valid JSON when published.`,
            "warning"
          )
        );
      }
    }
  }

  checks.push(
    check(
      "intelligence.tech-stack",
      "Tech stack fingerprint generated",
      Boolean(scan.techStack && scan.techStack.signals.length > 0),
      "The scan should include framework, hosting, CDN, CMS or repo-derived stack signals.",
      "warning"
    )
  );
  checks.push(
    check(
      "intelligence.route-templates",
      "Route template clusters generated",
      Array.isArray(scan.routeTemplates) && scan.routeTemplates.length > 0,
      "The scan should cluster crawled URLs by route/template shape.",
      "warning"
    )
  );
  checks.push(
    check(
      "intelligence.performance",
      "Performance audit generated",
      Boolean(scan.performance && scan.performance.metrics.length > 0),
      "The scan should include performance metrics and explicit limitations.",
      "warning"
    )
  );
  if (scan.performance) {
    const cwvMetrics = scan.performance.metrics.filter((metric) =>
      ["lcp-ms", "inp-ms", "cls"].includes(metric.id)
    );
    checks.push(
      check(
        "performance.cwv-no-fake-measurement",
        "Browser-only metrics are not fabricated",
        cwvMetrics.every(
          (metric) =>
            metric.reliability !== "not_measured" || metric.value === null || metric.status === "not_measured"
        ),
        "LCP, INP and CLS must be marked not_measured unless browser or field evidence exists.",
        "error"
      )
    );
    checks.push(
      check(
        "performance.resources-bounded",
        "Resource timing payload bounded",
        scan.performance.resources.length <= 2000,
        "Resource timing output should stay bounded for agent consumption.",
        "warning"
      )
    );
  }
  if (scan.config.repoPath) {
    checks.push(
      check(
        "repo.analysis-configured",
        "Configured repository analyzed",
        scan.repo?.status === "ok",
        "When --repo is supplied, repo-analysis.json should map source candidates.",
        "warning"
      )
    );
  }

  return checks;
}

function validateFinding(finding: Finding): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  checks.push({
    id: `validation.${finding.id}.evidence`,
    title: `${finding.id} evidence present`,
    status: finding.evidence.length > 0 ? "passed" : "failed",
    severity: finding.evidence.length > 0 ? "info" : "error",
    message: "Every finding must include evidence."
  });

  const requiresApproval = requiresApprovalForText(
    [finding.title, finding.recommendation, finding.rootCause].join("\n")
  );
  checks.push({
    id: `validation.${finding.id}.approval`,
    title: `${finding.id} approval boundary`,
    status: !requiresApproval || finding.approvalRequired ? "passed" : "failed",
    severity: !requiresApproval || finding.approvalRequired ? "info" : "error",
    message: "Risky policy, auth, payment, MCP mutation, indexability and canonical changes require approval."
  });

  checks.push({
    id: `validation.${finding.id}.private-evidence`,
    title: `${finding.id} private reference handling`,
    status:
      findingContainsPrivateReference(finding) && finding.severity !== "critical" ? "warning" : "passed",
    severity:
      findingContainsPrivateReference(finding) && finding.severity !== "critical" ? "warning" : "info",
    message:
      "Private references are allowed only as evidence for security findings and must not become public implementation suggestions."
  });
  checks.push({
    id: `validation.${finding.id}.actionability`,
    title: `${finding.id} actionability present`,
    status: finding.actionability ? "passed" : "failed",
    severity: finding.actionability ? "info" : "error",
    message: "Every finding should include owner, readiness, source candidates or blockers, and next step."
  });
  checks.push({
    id: `validation.${finding.id}.safe-fix-boundary`,
    title: `${finding.id} safe fix boundary`,
    status: finding.safeToAutoFix && finding.approvalRequired ? "failed" : "passed",
    severity: finding.safeToAutoFix && finding.approvalRequired ? "error" : "info",
    message: "A finding cannot be both safe to auto-fix and approval-required."
  });
  return checks;
}

async function fileExists(reportDir: string, file: string, required: boolean): Promise<ValidationCheck> {
  try {
    const result = await stat(join(reportDir, file));
    return check(
      `artifact.${file}`,
      `${file} generated`,
      result.isFile(),
      `${file} should be generated with the report bundle.`,
      required ? "error" : "warning"
    );
  } catch {
    return {
      id: `artifact.${file}`,
      title: `${file} generated`,
      status: required ? "failed" : "warning",
      severity: required ? "error" : "warning",
      message: `${file} should be generated with the report bundle.`
    };
  }
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function parsesJson(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

function check(
  id: string,
  title: string,
  ok: boolean,
  message: string,
  failureSeverity: "error" | "warning"
): ValidationCheck {
  return {
    id,
    title,
    status: ok ? "passed" : failureSeverity === "error" ? "failed" : "warning",
    message,
    severity: ok ? "info" : failureSeverity
  };
}

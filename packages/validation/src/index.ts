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
  "github-pr-comment.md",
  "executive-summary.md"
];

export async function runValidation(input: ValidationRunnerInput): Promise<ValidationResult> {
  const lint = await lintReport(input.reportDir, input.strict === undefined ? {} : { strict: input.strict });
  const checks: ValidationCheck[] = [...lint.checks];

  const scan = await readOptionalJson<ScanResult>(join(input.reportDir, "scan-result.json"));
  for (const file of RECOMMENDED_SCAN_FILES) {
    checks.push(await fileExists(input.reportDir, file, false));
  }

  if (scan) {
    checks.push(...validateScanArtifacts(scan));
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

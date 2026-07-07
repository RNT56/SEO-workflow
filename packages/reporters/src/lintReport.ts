import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  REQUIRED_REPORT_FILES,
  REPORT_SECTIONS,
  sectionHeading,
  validateAgentReview,
  validateAgentReviewInput,
  validateFindings,
  validateRemediationPlan,
  validateReportDashboard,
  validateScore
} from "@seo-polish/schemas";
import type {
  AgentReview,
  AgentReviewEvidenceLink,
  AgentReviewInput,
  FieldDataReport,
  Finding,
  ReportDashboard,
  ValidationCheck,
  ValidationResult
} from "@seo-polish/schemas";
import { findPrivateReferences, requiresApprovalForText } from "@seo-polish/security";

export interface ReportLintOptions {
  strict?: boolean;
}

export async function lintReport(
  reportDir: string,
  options: ReportLintOptions = {}
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const strict = options.strict === true;

  for (const file of REQUIRED_REPORT_FILES) {
    checks.push(await fileExists(reportDir, file));
  }

  const indexMd = await readText(join(reportDir, "index.md"));
  const indexHtml = await readText(join(reportDir, "index.html"));
  if (indexMd) {
    for (const section of REPORT_SECTIONS) {
      const heading = sectionHeading(section);
      checks.push(
        check(
          `section.${section.number}`,
          heading,
          indexMd.includes(heading),
          `Report must include ${heading}.`
        )
      );
      checks.push(
        check(
          `section.${section.number}.content`,
          `${heading} content`,
          sectionHasContent(indexMd, heading),
          `Report section ${heading} must include findings, Passed status or Not applicable status.`
        )
      );
    }
  }

  const findings = await readJson<Finding[]>(join(reportDir, "findings.json"), checks, "findings.json");
  const score = await readJson<unknown>(join(reportDir, "score.json"), checks, "score.json");
  const dashboard = await readJson<unknown>(
    join(reportDir, "report-dashboard.json"),
    checks,
    "report-dashboard.json"
  );
  const fieldData = await readJson<unknown>(join(reportDir, "field-data.json"), checks, "field-data.json");
  const agentReviewInput = await readJson<unknown>(
    join(reportDir, "agent-review-input.json"),
    checks,
    "agent-review-input.json"
  );
  const agentReview = await readJson<unknown>(
    join(reportDir, "agent-review.json"),
    checks,
    "agent-review.json"
  );
  const remediationPlan = await readJson<unknown>(
    join(reportDir, "remediation-plan.json"),
    checks,
    "remediation-plan.json"
  );
  await readJson<unknown>(join(reportDir, "validation.json"), checks, "validation.json");

  if (Array.isArray(findings)) {
    checks.push(...validateFindings(findings).checks);
    for (const finding of findings) {
      checks.push(...lintFindingSafety(finding, strict));
    }
  }

  if (score && typeof score === "object") {
    checks.push(...validateScore(score as Parameters<typeof validateScore>[0]).checks);
  }

  if (dashboard && typeof dashboard === "object") {
    checks.push(...validateReportDashboard(dashboard as ReportDashboard).checks);
  }

  if (fieldData && typeof fieldData === "object") {
    checks.push(...lintFieldData(fieldData as FieldDataReport));
  }

  if (agentReviewInput && typeof agentReviewInput === "object") {
    checks.push(...validateAgentReviewInput(agentReviewInput as AgentReviewInput).checks);
  }

  if (agentReview && typeof agentReview === "object") {
    checks.push(...validateAgentReview(agentReview as AgentReview).checks);
    checks.push(
      ...lintAgentReview(
        agentReview as AgentReview,
        agentReviewInput as AgentReviewInput | null,
        Array.isArray(findings) ? findings : [],
        strict
      )
    );
  }

  if (remediationPlan && typeof remediationPlan === "object") {
    checks.push(
      ...validateRemediationPlan(remediationPlan as Parameters<typeof validateRemediationPlan>[0]).checks
    );
  }

  if (strict && indexMd) {
    const leaked = findPrivateReferences(indexMd).filter(isSecretLikeReference);
    checks.push(
      check(
        "safety.private-public",
        "Secret public report scan",
        leaked.length === 0,
        "Report should not expose secret-looking values."
      )
    );
  }

  if (strict && agentReview && typeof agentReview === "object") {
    const serializedReview = JSON.stringify(agentReview);
    const leaked = findPrivateReferences(serializedReview).filter(isSecretLikeReference);
    checks.push(
      check(
        "agent-review.no-private-output",
        "Agent review public narrative secret scan",
        leaked.length === 0,
        "Agent-authored public outputs must not expose secret-looking values."
      )
    );
  }

  if (strict && indexHtml) {
    checks.push(...lintHtmlReport(indexHtml));
  }

  if (strict && dashboard) {
    checks.push(
      check(
        "dashboard.size",
        "Dashboard payload size",
        Buffer.byteLength(JSON.stringify(dashboard), "utf8") <= 3_000_000,
        "report-dashboard.json should stay below 3 MB for agent and browser consumption."
      )
    );
  }

  return {
    ok: checks.every((item) => item.status !== "failed"),
    generatedAt: new Date().toISOString(),
    checks
  };
}

function lintAgentReview(
  review: AgentReview,
  input: AgentReviewInput | null,
  findings: Finding[],
  strict: boolean
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const evidenceIds = new Set(findings.flatMap((finding) => finding.evidence.map((item) => item.id)));
  const findingIds = new Set(findings.map((finding) => finding.id));
  const urls = new Set(
    findings.flatMap((finding) => [
      ...finding.affectedUrls,
      ...finding.evidence.map((item) => item.url).filter((url): url is string => Boolean(url))
    ])
  );
  const sourceArtifacts = new Set([...(input?.sourceArtifacts ?? []), ...REQUIRED_REPORT_FILES]);

  checks.push(
    check(
      "agent-review.input-present",
      "Agent review input present",
      Boolean(input && input.status === "ready"),
      "agent-review-input.json must exist before review completion."
    )
  );

  if (strict) {
    checks.push(
      check(
        "agent-review.complete",
        "Agent review complete",
        review.status === "complete" && review.reviewer !== "pending",
        "Strict report lint requires completed agent review artifacts."
      )
    );
  }

  if (review.status !== "complete") {
    return checks;
  }

  const strategicFindings = Array.isArray(review.strategicFindings) ? review.strategicFindings : [];
  const copyRecommendations = Array.isArray(review.copyRecommendations) ? review.copyRecommendations : [];
  const taskSimulations = Array.isArray(review.agentSkills?.taskSimulations)
    ? review.agentSkills.taskSimulations
    : [];
  const citedCollections: Array<[string, AgentReviewEvidenceLink[]]> = [
    ["final-audit", Array.isArray(review.finalAudit?.evidence) ? review.finalAudit.evidence : []],
    ["search-intent", Array.isArray(review.searchIntent?.evidence) ? review.searchIntent.evidence : []],
    ["agent-skills", Array.isArray(review.agentSkills?.evidence) ? review.agentSkills.evidence : []],
    ...taskSimulations.map((task, index): [string, AgentReviewEvidenceLink[]] => [
      `agent-skills.task.${index}`,
      Array.isArray(task.evidence) ? task.evidence : []
    ]),
    ...strategicFindings.map((finding): [string, AgentReviewEvidenceLink[]] => [
      `strategic.${finding.id}`,
      Array.isArray(finding.evidence) ? finding.evidence : []
    ]),
    ...copyRecommendations.map((copy): [string, AgentReviewEvidenceLink[]] => [
      `copy.${copy.id}`,
      Array.isArray(copy.evidence) ? copy.evidence : []
    ])
  ];

  for (const [id, evidence] of citedCollections) {
    checks.push(
      check(
        `agent-review.${id}.evidence-supported`,
        `${id} evidence supported`,
        evidence.length > 0 &&
          evidence.every((link) =>
            evidenceLinkSupported(link, evidenceIds, findingIds, urls, sourceArtifacts)
          ),
        "Completed review claims must cite existing evidence IDs, finding IDs, affected URLs or source artifacts."
      )
    );
  }

  for (const finding of strategicFindings) {
    const text = [finding.title, finding.summary, finding.recommendation].join("\n");
    checks.push(
      check(
        `agent-review.strategic.${finding.id}.approval`,
        `${finding.id} approval gate`,
        !requiresReviewApproval(text) || finding.approvalState === "approval_required",
        "Risky policy, indexability, canonical, auth, payment, MCP, crawler, brand or commercial recommendations must be approval-gated."
      )
    );
  }

  for (const copy of copyRecommendations) {
    const text = [copy.target, copy.current ?? "", copy.proposed, copy.rationale].join("\n");
    checks.push(
      check(
        `agent-review.copy.${copy.id}.approval`,
        `${copy.id} approval gate`,
        !requiresReviewApproval(text) || copy.approvalState === "approval_required",
        "Risky copy proposals involving claims, policy, canonical/indexing, auth, payment, crawler or MCP decisions must be approval-gated."
      ),
      check(
        `agent-review.copy.${copy.id}.safe`,
        `${copy.id} safe proposal boundary`,
        !copy.safeToApply || copy.approvalState === "not_required",
        "Copy proposals marked safe cannot also require approval."
      )
    );
  }

  return checks;
}

function evidenceLinkSupported(
  link: AgentReviewEvidenceLink,
  evidenceIds: Set<string>,
  findingIds: Set<string>,
  urls: Set<string>,
  sourceArtifacts: Set<string>
): boolean {
  return Boolean(
    (link.evidenceId && evidenceIds.has(link.evidenceId)) ||
    (link.findingId && findingIds.has(link.findingId)) ||
    (link.url && urls.has(link.url)) ||
    (link.sourceArtifact && sourceArtifacts.has(link.sourceArtifact))
  );
}

function requiresReviewApproval(text: string): boolean {
  return (
    requiresApprovalForText(text) ||
    /\b(best|#1|number one|guarantee|guaranteed|certified|revenue|award-winning|official partner|trusted by|customers include|clients include)\b/i.test(
      text
    )
  );
}

function lintHtmlReport(html: string): ValidationCheck[] {
  const ids = matchAll(html, /\sid="([^"]+)"/g);
  const duplicateIds = duplicates(ids);
  const copyTargets = matchAll(html, /data-copy="([^"]+)"/g);
  const missingCopyTargets = copyTargets.filter((target) => !ids.includes(target));
  const viewTabs = matchAll(html, /data-view-tab="([^"]+)"/g);
  const viewPanels = matchAll(html, /data-view-panel="([^"]+)"/g);
  const missingViewPanels = viewTabs.filter((tab) => !viewPanels.includes(tab));
  const emptyPanels = matchAll(html, /<div[^>]+data-view-panel="([^"]+)"[^>]*>\s*<\/div>/g);

  return [
    check(
      "html.duplicate-ids",
      "HTML duplicate IDs",
      duplicateIds.length === 0,
      duplicateIds.length === 0
        ? "HTML IDs are unique."
        : `Duplicate HTML IDs: ${duplicateIds.slice(0, 12).join(", ")}.`
    ),
    check(
      "html.copy-targets",
      "Copy controls target existing elements",
      missingCopyTargets.length === 0,
      missingCopyTargets.length === 0
        ? "All copy buttons have valid targets."
        : `Missing copy targets: ${missingCopyTargets.slice(0, 12).join(", ")}.`
    ),
    check(
      "html.view-tabs",
      "View tabs target existing panels",
      missingViewPanels.length === 0,
      missingViewPanels.length === 0
        ? "All view tabs have matching panels."
        : `Missing view panels: ${missingViewPanels.slice(0, 12).join(", ")}.`
    ),
    check(
      "html.empty-view-panels",
      "View panels are not empty",
      emptyPanels.length === 0,
      emptyPanels.length === 0
        ? "No empty view panels detected."
        : `Empty view panels: ${emptyPanels.slice(0, 12).join(", ")}.`
    ),
    check(
      "html.queue-filters",
      "Implementation queue filters present",
      ["owner", "fixClass", "readiness", "approval"].every((filter) =>
        html.includes(`data-queue-filter="${filter}"`)
      ),
      "Report must include owner, fix class, readiness and approval filters."
    )
  ];
}

function lintFieldData(fieldData: FieldDataReport): ValidationCheck[] {
  const serialized = JSON.stringify(fieldData);
  return [
    check(
      "field-data.status",
      "Field data status declared",
      ["disabled", "ok", "partial", "unavailable", "failed"].includes(fieldData.status),
      "field-data.json must declare a valid status."
    ),
    check(
      "field-data.providers",
      "Field data providers bounded",
      fieldData.providersRequested.every((provider) => ["crux", "gsc", "rum"].includes(provider)),
      "field-data.json must only include known provider names."
    ),
    check(
      "field-data.no-credentials",
      "Field data artifact excludes credentials",
      !/(AIza[0-9A-Za-z_-]{20,}|Bearer\s+[0-9A-Za-z._-]+)/.test(serialized),
      "field-data.json must not serialize API keys or bearer tokens."
    )
  ];
}

function matchAll(input: string, pattern: RegExp): string[] {
  return [...input.matchAll(pattern)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }
  return [...repeated].sort();
}

async function fileExists(reportDir: string, file: string): Promise<ValidationCheck> {
  try {
    const result = await stat(join(reportDir, file));
    return check(`file.${file}`, `${file} exists`, result.isFile(), `${file} must exist.`);
  } catch {
    return check(`file.${file}`, `${file} exists`, false, `${file} must exist.`);
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function readJson<T>(path: string, checks: ValidationCheck[], label: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as T;
    checks.push(check(`json.${label}`, `${label} parses`, true, `${label} is valid JSON.`));
    return parsed;
  } catch (error) {
    checks.push(
      check(`json.${label}`, `${label} parses`, false, error instanceof Error ? error.message : String(error))
    );
    return null;
  }
}

function lintFindingSafety(finding: Finding, strict: boolean): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const recommendationText = [
    finding.title,
    finding.recommendation,
    finding.rootCause,
    ...finding.validation
  ].join("\n");

  checks.push(
    check(
      `finding.${finding.id}.approval`,
      `${finding.id} approval gate`,
      !requiresApprovalForText(recommendationText) || finding.approvalRequired,
      "Policy, auth, payment, MCP mutation, index/noindex and ambiguous canonical changes must require approval."
    )
  );

  checks.push(
    check(
      `finding.${finding.id}.safe-validation`,
      `${finding.id} safe fix validation`,
      !finding.safeToAutoFix || finding.validation.length > 0,
      "Safe auto-fixes must include validation steps."
    )
  );

  if (strict) {
    const privateRefs = findPrivateReferences(
      [finding.recommendation, finding.rootCause, ...finding.validation].join("\n")
    );
    checks.push(
      check(
        `finding.${finding.id}.private-suggestion`,
        `${finding.id} private suggestion scan`,
        privateRefs.length === 0,
        "Recommendations and validation commands must not publish private URLs or secrets."
      )
    );
  }

  return checks;
}

function check(id: string, title: string, ok: boolean, message: string): ValidationCheck {
  return {
    id,
    title,
    status: ok ? "passed" : "failed",
    message,
    severity: ok ? "info" : "error"
  };
}

function isSecretLikeReference(reference: string): boolean {
  const lower = reference.toLowerCase();
  const markers = [
    ["token", "="].join(""),
    ["api", "_", "key", "="].join(""),
    ["apikey", "="].join(""),
    ["secret", "="].join(""),
    ["password", "="].join("")
  ];
  return (
    markers.some((marker) => lower.includes(marker)) ||
    reference.startsWith("sk-") ||
    reference.startsWith("ghp_") ||
    reference.startsWith("gho_") ||
    reference.startsWith("ghu_") ||
    reference.startsWith("ghs_") ||
    reference.startsWith("ghr_") ||
    reference.startsWith("xox")
  );
}

function sectionHasContent(markdown: string, heading: string): boolean {
  const start = markdown.indexOf(heading);
  if (start < 0) {
    return false;
  }
  const contentStart = start + heading.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  const content = markdown.slice(contentStart, nextHeading < 0 ? markdown.length : nextHeading).trim();
  return content.length > 0;
}

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeEvidenceStore } from "@seo-polish/evidence";
import { generatePatchBundle } from "@seo-polish/patchers";
import { createRemediationPlan } from "@seo-polish/remediation";
import {
  buildPendingAgentReview,
  lintReport,
  writeReportBundle,
  type ReportDashboardQualityGate
} from "@seo-polish/reporters";
import { evaluateRules } from "@seo-polish/rules";
import { scanSite } from "@seo-polish/scanner";
import type {
  BaselineComparison,
  AgentReview,
  Finding,
  PerformanceAudit,
  ReportBundle,
  ScanSummary,
  Score,
  Severity,
  SuppressionReport,
  SuppressionRule,
  ValidationResult,
  WorkflowRetrospective
} from "@seo-polish/schemas";
import { calculateScore } from "@seo-polish/scoring";
import { redactSensitiveValue } from "@seo-polish/security";
import { buildStandardsSnapshot } from "@seo-polish/standards-registry";
import { runValidation } from "@seo-polish/validation";
import { finalizeAuditOutputConfig } from "../config/auditOutput.js";
import type { ScanConfigInput } from "../config/resolveConfig.js";
import { resolveConfig } from "../config/resolveConfig.js";

export async function runScan(input: ScanConfigInput): Promise<ScanSummary> {
  const initialConfig = await resolveConfig(input);

  const rawScan = await scanSite(initialConfig);
  const config = finalizeAuditOutputConfig(initialConfig, rawScan.scanId);
  const rawScanWithFinalConfig = { ...rawScan, config };
  await mkdir(config.outputDir, { recursive: true });
  const rawFindings = evaluateRules(rawScanWithFinalConfig);
  const scan = redactSensitiveValue(rawScanWithFinalConfig);
  const findings = rawFindings.map((finding) => redactSensitiveValue(finding));
  const score = calculateScore(findings);
  const remediationPlan = createRemediationPlan(findings);
  const patchBundle = generatePatchBundle(config, findings, remediationPlan);
  const suppressionReport = buildSuppressionReport(config.suppressions ?? [], findings);
  const baselineComparison = await buildBaselineComparison(
    config.baselinePath,
    findings,
    score,
    scan.performance
  );

  const initialValidation: ValidationResult = {
    ok: true,
    generatedAt: new Date().toISOString(),
    checks: [
      {
        id: "report.initial-render",
        title: "Initial report render",
        status: "passed",
        severity: "info",
        message: "Initial report files rendered before strict validation."
      }
    ]
  };

  const bundle: ReportBundle = {
    scan,
    findings,
    score,
    remediationPlan,
    validation: initialValidation,
    patchDiff: patchBundle.patchDiff
  };

  await writeEvidenceStore(config.outputDir, scan);
  await writePatchSupportFiles(config.outputDir, patchBundle);
  await writeIntelligenceSupportFiles(config.outputDir, findings, baselineComparison, suppressionReport);
  await writeFile(join(config.outputDir, "scan-result.json"), `${JSON.stringify(scan, null, 2)}\n`, "utf8");
  await writeReportBundle(config.outputDir, bundle, {
    baselineComparison,
    agentReview: buildPendingAgentReview(bundle)
  });
  await writeFinalSupportFiles(config.outputDir, bundle, baselineComparison);
  await writeQualityGate(config.outputDir, bundle, suppressionReport, baselineComparison);

  const validation = await runValidation({ reportDir: config.outputDir, findings, strict: true });
  const finalBundle: ReportBundle = { ...bundle, validation };
  const qualityGate = await writeQualityGate(
    config.outputDir,
    finalBundle,
    suppressionReport,
    baselineComparison
  );
  await writeReportBundle(config.outputDir, finalBundle, {
    baselineComparison,
    qualityGate,
    agentReview: buildPendingAgentReview(finalBundle)
  });
  await writeFinalSupportFiles(config.outputDir, finalBundle, baselineComparison);
  await writeAuditRunFiles(config.outputDir, finalBundle, qualityGate);

  return {
    scanId: scan.scanId,
    reportPath: config.outputDir,
    score,
    findingCounts: countFindings(findings)
  };
}

async function writeAuditRunFiles(
  outputDir: string,
  bundle: ReportBundle,
  qualityGate: ReportDashboardQualityGate
): Promise<void> {
  const config = bundle.scan.config;
  const artifacts = [...new Set([...(await artifactList(outputDir)), "audit-run.json"])].sort();
  const metadata = {
    version: "2026-07-07.audit-storage",
    generatedAt: new Date().toISOString(),
    targetUrl: config.url,
    scanId: bundle.scan.scanId,
    startedAt: bundle.scan.startedAt,
    completedAt: bundle.scan.completedAt,
    auditRoot: config.auditRoot ?? null,
    auditName: config.auditName ?? null,
    auditSlug: config.auditSlug ?? null,
    auditRunId: config.auditRunId ?? null,
    auditOutputMode: config.auditOutputMode ?? "explicit",
    reportPath: outputDir,
    score: bundle.score.total,
    level: bundle.score.level,
    findingCounts: countFindings(bundle.findings),
    qualityGateStatus: qualityGate.status ?? "failed",
    productionReadiness: qualityGate.status ?? "failed",
    artifacts,
    exportProfiles: ["review", "full", "repo-import", "learnings"],
    privacy: {
      exportsRedactLocalPathsByDefault: true,
      cloudUploadRequiresExplicitUserDirection: true
    }
  };
  await writeFile(join(outputDir, "audit-run.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  if (config.auditOutputMode === "auto" && config.auditRoot) {
    await writeAuditIndex(config.auditRoot, metadata);
  }
}

async function artifactList(outputDir: string, current = outputDir): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const artifacts: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    const relativePath = path.slice(outputDir.length + 1).replace(/\\/g, "/");
    if (relativePath === "exports" || relativePath.startsWith("exports/")) {
      continue;
    }
    if (entry.isDirectory()) {
      artifacts.push(...(await artifactList(outputDir, path)));
      continue;
    }
    if (entry.isFile()) {
      artifacts.push(relativePath);
    }
  }
  return artifacts.sort();
}

async function writeAuditIndex(
  auditRoot: string,
  metadata: Awaited<ReturnType<typeof buildAuditIndexEntry>>
): Promise<void> {
  await mkdir(auditRoot, { recursive: true });
  const indexPath = join(auditRoot, "audit-index.json");
  const existing = await readOptionalJson<{ version?: string; runs?: unknown[] }>(indexPath);
  const runs = Array.isArray(existing?.runs) ? existing.runs : [];
  const entry = buildAuditIndexEntry(metadata);
  const filtered = runs.filter(
    (item) =>
      !(
        item &&
        typeof item === "object" &&
        "scanId" in item &&
        (item as { scanId?: unknown }).scanId === entry.scanId
      )
  );
  await writeFile(
    indexPath,
    `${JSON.stringify({ version: "2026-07-07.audit-index", updatedAt: new Date().toISOString(), runs: [...filtered, entry] }, null, 2)}\n`,
    "utf8"
  );
}

function buildAuditIndexEntry(metadata: {
  targetUrl: string;
  scanId: string;
  completedAt: string;
  auditSlug: string | null;
  auditRunId: string | null;
  reportPath: string;
  score: number;
  level: string;
  qualityGateStatus: string;
}): {
  targetUrl: string;
  scanId: string;
  completedAt: string;
  auditSlug: string | null;
  auditRunId: string | null;
  reportPath: string;
  score: number;
  level: string;
  qualityGateStatus: string;
} {
  return {
    targetUrl: metadata.targetUrl,
    scanId: metadata.scanId,
    completedAt: metadata.completedAt,
    auditSlug: metadata.auditSlug,
    auditRunId: metadata.auditRunId,
    reportPath: metadata.reportPath,
    score: metadata.score,
    level: metadata.level,
    qualityGateStatus: metadata.qualityGateStatus
  };
}

export async function runReportLint(reportDir: string, strict = false): Promise<ValidationResult> {
  return lintReport(reportDir, { strict });
}

export async function runValidate(reportDir: string, strict = true): Promise<ValidationResult> {
  const findings = await readJson<Finding[]>(join(reportDir, "findings.json"));
  return runValidation({ reportDir, findings, strict });
}

export async function runPlan(findingsPath: string, outputPath: string): Promise<void> {
  const findings = await readJson<Finding[]>(findingsPath);
  const plan = createRemediationPlan(findings);
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

export async function runApply(planPath: string, outputDir: string): Promise<void> {
  const plan = await readJson<ReportBundle["remediationPlan"]>(planPath);
  const lines = ["# Diff-only patch proposal", ""];
  for (const phase of plan.phases) {
    lines.push(`## ${phase.title}`);
    for (const item of phase.items) {
      lines.push(`- ${item.findingId}: ${item.implementationPath}`);
    }
    lines.push("");
  }
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "patch.diff"), `${lines.join("\n")}\n`, "utf8");
}

function countFindings(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );
}

async function writePatchSupportFiles(
  outputDir: string,
  patchBundle: ReturnType<typeof generatePatchBundle>
): Promise<void> {
  await writeFile(join(outputDir, "patch-plan.md"), patchBundle.patchPlanMarkdown, "utf8");
  await writeFile(
    join(outputDir, "changed-files.json"),
    `${JSON.stringify(patchBundle.changedFiles, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "framework-actions.json"),
    `${JSON.stringify(patchBundle.frameworkActions, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "manual-actions.md"),
    `${patchBundle.manualActions.map((item) => `- ${item}`).join("\n")}\n`,
    "utf8"
  );
}

async function writeIntelligenceSupportFiles(
  outputDir: string,
  findings: Finding[],
  baselineComparison: BaselineComparison,
  suppressionReport: SuppressionReport
): Promise<void> {
  await writeFile(
    join(outputDir, "actionability.json"),
    `${JSON.stringify(actionabilitySummary(findings), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "baseline-comparison.json"),
    `${JSON.stringify(baselineComparison, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "suppression-report.json"),
    `${JSON.stringify(suppressionReport, null, 2)}\n`,
    "utf8"
  );
}

async function writeQualityGate(
  outputDir: string,
  bundle: ReportBundle,
  suppressionReport: SuppressionReport,
  baselineComparison: BaselineComparison
): Promise<ReportDashboardQualityGate> {
  const missingActionability = bundle.findings.filter((finding) => !finding.actionability).length;
  const evidenceFreeFindings = bundle.findings.filter((finding) => finding.evidence.length === 0).length;
  const invalidSafeFixes = bundle.findings.filter(
    (finding) => finding.safeToAutoFix && finding.approvalRequired
  ).length;
  const agentReview = await readOptionalJson<AgentReview>(join(outputDir, "agent-review.json"));
  const agentReviewStatus = agentReview?.status ?? "pending";
  const agentReviewIncomplete = agentReviewStatus !== "complete";
  const workflowRetrospective = await readOptionalJson<WorkflowRetrospective>(
    join(outputDir, "workflow-retrospective.json")
  );
  const workflowRetrospectiveStatus = workflowRetrospective?.status ?? "pending";
  const status =
    bundle.validation.ok &&
    missingActionability === 0 &&
    evidenceFreeFindings === 0 &&
    invalidSafeFixes === 0 &&
    !agentReviewIncomplete
      ? "passed"
      : "failed";
  const qualityGate = {
    generatedAt: new Date().toISOString(),
    status,
    reportValid: bundle.validation.ok,
    checks: {
      missingActionability,
      evidenceFreeFindings,
      invalidSafeFixes,
      agentReviewStatus,
      workflowRetrospectiveStatus,
      suppressionMatches: suppressionReport.matches.length,
      baselineStatus: baselineComparison.status
    },
    stopConditions:
      status === "passed"
        ? []
        : [
            ...(!bundle.validation.ok ? ["validation failed"] : []),
            ...(missingActionability > 0 ? ["findings missing actionability"] : []),
            ...(evidenceFreeFindings > 0 ? ["findings missing evidence"] : []),
            ...(invalidSafeFixes > 0 ? ["safe auto-fix conflicts with approval gate"] : []),
            ...(agentReviewIncomplete ? ["agent review incomplete"] : [])
          ]
  };
  await writeFile(join(outputDir, "quality-gate.json"), `${JSON.stringify(qualityGate, null, 2)}\n`, "utf8");
  await writeFile(
    join(outputDir, "production-readiness.json"),
    `${JSON.stringify(qualityGate, null, 2)}\n`,
    "utf8"
  );
  return qualityGate;
}

async function writeFinalSupportFiles(
  outputDir: string,
  bundle: ReportBundle,
  baselineComparison: BaselineComparison
): Promise<void> {
  await writeFile(
    join(outputDir, "before-after-score.json"),
    `${JSON.stringify(
      {
        baseline:
          baselineComparison.status === "ok"
            ? {
                scoreDelta: baselineComparison.scoreDelta,
                newFindingGroups: baselineComparison.newFindingGroups,
                resolvedFindingGroups: baselineComparison.resolvedFindingGroups,
                recurringFindingGroups: baselineComparison.recurringFindingGroups
              }
            : null,
        current: bundle.score,
        after: null,
        status: baselineComparison.status === "ok" ? "baseline_compared" : "baseline_not_available",
        message:
          baselineComparison.status === "ok"
            ? "Baseline comparison is available in baseline-comparison.json."
            : "Run with --baseline <report-dir-or-file> to populate before/after score comparison."
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "standards-registry.json"),
    `${JSON.stringify(buildStandardsSnapshot(), null, 2)}\n`,
    "utf8"
  );

  const decisionLines = [
    "# Remaining User Decisions",
    "",
    ...bundle.remediationPlan.userDecisions.flatMap((decision, index) => [
      `${index + 1}. ${decision.title}`,
      `   Reason: ${decision.reason}`,
      `   Default: ${decision.default}`,
      `   Options: ${decision.options.join(", ")}`,
      ""
    ])
  ];
  await writeFile(join(outputDir, "remaining-user-decisions.md"), decisionLines.join("\n"), "utf8");
}

function actionabilitySummary(findings: Finding[]): unknown {
  const byOwner: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const finding of findings) {
    const owner = finding.actionability?.owner ?? "unknown";
    const readiness = finding.actionability?.automationReadiness ?? "manual";
    byOwner[owner] = (byOwner[owner] ?? 0) + 1;
    byReadiness[readiness] = (byReadiness[readiness] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    byOwner,
    byReadiness,
    findings: findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      owner: finding.actionability?.owner ?? "unknown",
      automationReadiness: finding.actionability?.automationReadiness ?? "manual",
      sourceLocations: finding.actionability?.sourceLocations ?? [],
      blockers: finding.actionability?.blockers ?? [],
      nextStep: finding.actionability?.nextStep ?? finding.recommendation
    }))
  };
}

function buildSuppressionReport(suppressions: SuppressionRule[], findings: Finding[]): SuppressionReport {
  const now = Date.now();
  const active: SuppressionRule[] = [];
  const expired: SuppressionRule[] = [];
  const matches: SuppressionReport["matches"] = [];
  for (const suppression of suppressions) {
    if (suppression.expiresAt && Date.parse(suppression.expiresAt) < now) {
      expired.push(suppression);
      continue;
    }
    active.push(suppression);
    const urlPattern = compileSuppressionPattern(suppression);
    const matchedUrls = findings
      .filter((finding) => finding.id === suppression.findingId)
      .flatMap((finding) => finding.affectedUrls)
      .filter((url) => !urlPattern || urlPattern.test(url));
    if (matchedUrls.length > 0) {
      matches.push({
        suppressionId: suppression.id,
        findingId: suppression.findingId,
        matchedUrls: [...new Set(matchedUrls)],
        reason: suppression.reason
      });
    }
  }
  const matchedSuppressionIds = new Set(matches.map((match) => match.suppressionId));
  return {
    generatedAt: new Date().toISOString(),
    suppressedCount: matches.length,
    active,
    expired,
    unmatched: active.filter((suppression) => !matchedSuppressionIds.has(suppression.id)),
    matches
  };
}

function compileSuppressionPattern(suppression: SuppressionRule): RegExp | null {
  if (!suppression.urlPattern) {
    return null;
  }
  try {
    return new RegExp(suppression.urlPattern);
  } catch {
    return /$a/;
  }
}

async function buildBaselineComparison(
  baselinePath: string | undefined,
  findings: Finding[],
  score: Score,
  performance: PerformanceAudit | undefined
): Promise<BaselineComparison> {
  const generatedAt = new Date().toISOString();
  if (!baselinePath) {
    return emptyBaseline(generatedAt, "not_configured", ["No baseline path was configured."]);
  }
  const baseline = await readBaseline(baselinePath);
  if (!baseline) {
    return emptyBaseline(
      generatedAt,
      "missing",
      [`Could not read baseline from ${baselinePath}.`],
      baselinePath
    );
  }

  const currentIds = uniqueFindingIds(findings);
  const baselineIds = uniqueFindingIds(baseline.findings);
  const currentSet = new Set(currentIds);
  const baselineSet = new Set(baselineIds);
  return {
    generatedAt,
    status: "ok",
    baselinePath,
    scoreDelta: score.total - baseline.score.total,
    newFindingGroups: currentIds.filter((id) => !baselineSet.has(id)),
    resolvedFindingGroups: baselineIds.filter((id) => !currentSet.has(id)),
    recurringFindingGroups: currentIds.filter((id) => baselineSet.has(id)),
    performanceDeltas: performanceDeltas(baseline.performance, performance),
    notes: ["Positive scoreDelta means the current scan scored higher than the baseline."]
  };
}

function emptyBaseline(
  generatedAt: string,
  status: BaselineComparison["status"],
  notes: string[],
  baselinePath?: string
): BaselineComparison {
  return {
    generatedAt,
    status,
    ...(baselinePath ? { baselinePath } : {}),
    newFindingGroups: [],
    resolvedFindingGroups: [],
    recurringFindingGroups: [],
    performanceDeltas: {},
    notes
  };
}

async function readBaseline(
  baselinePath: string
): Promise<{ findings: Finding[]; score: Score; performance?: PerformanceAudit } | null> {
  try {
    const score = await readJson<Score>(join(baselinePath, "score.json"));
    const findings = await readJson<Finding[]>(join(baselinePath, "findings.json"));
    const performance = await readOptionalJson<PerformanceAudit>(
      join(baselinePath, "performance-audit.json")
    );
    return { findings, score, ...(performance ? { performance } : {}) };
  } catch {
    try {
      const bundle = await readJson<ReportBundle>(baselinePath);
      return {
        findings: bundle.findings,
        score: bundle.score,
        ...(bundle.scan.performance ? { performance: bundle.scan.performance } : {})
      };
    } catch {
      return null;
    }
  }
}

function uniqueFindingIds(findings: Finding[]): string[] {
  return [...new Set(findings.map((finding) => finding.id))].sort();
}

function performanceDeltas(
  baseline: PerformanceAudit | undefined,
  current: PerformanceAudit | undefined
): Record<string, number> {
  if (!baseline || !current) {
    return {};
  }
  const baselineMetrics = new Map(
    baseline.metrics
      .filter((metric) => typeof metric.value === "number")
      .map((metric) => [metric.id, metric.value as number])
  );
  return Object.fromEntries(
    current.metrics
      .filter((metric) => typeof metric.value === "number" && baselineMetrics.has(metric.id))
      .map((metric) => [metric.id, (metric.value as number) - (baselineMetrics.get(metric.id) ?? 0)])
  );
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

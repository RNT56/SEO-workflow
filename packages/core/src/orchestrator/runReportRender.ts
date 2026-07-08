import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lintReport, writeReportBundle } from "@seo-polish/reporters";
import type { AgentExecutionPlanBenchmark, ReportDashboardQualityGate } from "@seo-polish/reporters";
import type {
  AgentReview,
  BaselineComparison,
  Finding,
  RemediationPlan,
  ReportBundle,
  ScanResult,
  Score,
  ValidationResult,
  WorkflowRetrospective
} from "@seo-polish/schemas";
import { buildStandardsSnapshot } from "@seo-polish/standards-registry";

export async function runReportRender(reportDir: string): Promise<void> {
  const bundle: ReportBundle = {
    scan: await readJson<ScanResult>(join(reportDir, "scan-result.json")),
    findings: await readJson<Finding[]>(join(reportDir, "findings.json")),
    score: await readJson<Score>(join(reportDir, "score.json")),
    remediationPlan: await readJson<RemediationPlan>(join(reportDir, "remediation-plan.json")),
    validation: await readJson<ValidationResult>(join(reportDir, "validation.json")),
    patchDiff: await readText(join(reportDir, "patch.diff"))
  };
  const benchmark = await readOptionalJson<AgentExecutionPlanBenchmark>(join(reportDir, "benchmark.json"));
  const baselineComparison = await readOptionalJson<BaselineComparison>(
    join(reportDir, "baseline-comparison.json")
  );
  const qualityGate = await readOptionalJson<ReportDashboardQualityGate>(
    join(reportDir, "quality-gate.json")
  );
  await writeReportBundle(reportDir, bundle, { benchmark, baselineComparison, qualityGate });
  await writeRenderSupportFiles(reportDir, bundle, baselineComparison);
  const validation = await lintReport(reportDir, { strict: true });
  await writeFile(join(reportDir, "validation.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  const finalBundle = { ...bundle, validation };
  const finalQualityGate = await writeRenderQualityGate(reportDir, finalBundle, baselineComparison);
  await writeReportBundle(reportDir, finalBundle, {
    benchmark,
    baselineComparison,
    qualityGate: finalQualityGate
  });
  await writeRenderSupportFiles(reportDir, finalBundle, baselineComparison);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function writeRenderSupportFiles(
  reportDir: string,
  bundle: ReportBundle,
  baselineComparison: BaselineComparison | null
): Promise<void> {
  await writeFile(
    join(reportDir, "browser-evidence.json"),
    `${JSON.stringify(bundle.scan.browserEvidence ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "field-data.json"),
    `${JSON.stringify(bundle.scan.fieldData ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "crux-history.json"),
    `${JSON.stringify(bundle.scan.fieldData?.crux?.history ?? [], null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "search-console.json"),
    `${JSON.stringify(bundle.scan.fieldData?.searchConsole ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "url-inspection.json"),
    `${JSON.stringify(bundle.scan.fieldData?.searchConsole?.urlInspection ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "rum-vitals.json"),
    `${JSON.stringify(bundle.scan.fieldData?.rum ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "standards-registry.json"),
    `${JSON.stringify(buildStandardsSnapshot(), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(reportDir, "before-after-score.json"),
    `${JSON.stringify(buildBeforeAfterScore(bundle, baselineComparison), null, 2)}\n`,
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
  await writeFile(join(reportDir, "remaining-user-decisions.md"), decisionLines.join("\n"), "utf8");
}

function buildBeforeAfterScore(bundle: ReportBundle, baselineComparison: BaselineComparison | null): unknown {
  if (baselineComparison?.status === "ok") {
    return {
      baseline: {
        scoreDelta: baselineComparison.scoreDelta,
        newFindingGroups: baselineComparison.newFindingGroups,
        resolvedFindingGroups: baselineComparison.resolvedFindingGroups,
        recurringFindingGroups: baselineComparison.recurringFindingGroups
      },
      current: bundle.score,
      after: null,
      status: "baseline_compared",
      message: "Baseline comparison is available in baseline-comparison.json."
    };
  }
  return {
    baseline: null,
    current: bundle.score,
    after: null,
    status: "baseline_not_available",
    message: "Run with --baseline <report-dir-or-file> to populate before/after score comparison."
  };
}

async function writeRenderQualityGate(
  reportDir: string,
  bundle: ReportBundle,
  baselineComparison: BaselineComparison | null
): Promise<ReportDashboardQualityGate> {
  const missingActionability = bundle.findings.filter((finding) => !finding.actionability).length;
  const evidenceFreeFindings = bundle.findings.filter((finding) => finding.evidence.length === 0).length;
  const invalidSafeFixes = bundle.findings.filter(
    (finding) => finding.safeToAutoFix && finding.approvalRequired
  ).length;
  const agentReview = await readOptionalJson<AgentReview>(join(reportDir, "agent-review.json"));
  const agentReviewStatus = agentReview?.status ?? "pending";
  const agentReviewIncomplete = agentReviewStatus !== "complete";
  const workflowRetrospective = await readOptionalJson<WorkflowRetrospective>(
    join(reportDir, "workflow-retrospective.json")
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
      baselineStatus: baselineComparison?.status ?? "not_configured"
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
  await writeFile(join(reportDir, "quality-gate.json"), `${JSON.stringify(qualityGate, null, 2)}\n`, "utf8");
  await writeFile(
    join(reportDir, "production-readiness.json"),
    `${JSON.stringify(qualityGate, null, 2)}\n`,
    "utf8"
  );
  return qualityGate;
}

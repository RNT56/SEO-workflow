import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeReportBundle } from "@seo-polish/reporters";
import type { AgentExecutionPlanBenchmark, ReportDashboardQualityGate } from "@seo-polish/reporters";
import type {
  BaselineComparison,
  Finding,
  RemediationPlan,
  ReportBundle,
  ScanResult,
  Score,
  ValidationResult
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
  await writeRenderSupportFiles(reportDir, bundle);
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

async function writeRenderSupportFiles(reportDir: string, bundle: ReportBundle): Promise<void> {
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
    `${JSON.stringify(
      {
        baseline: null,
        current: bundle.score,
        after: null,
        status: "baseline_not_available",
        message: "Run a second scan after applying safe fixes to populate before/after score comparison."
      },
      null,
      2
    )}\n`,
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

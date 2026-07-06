import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeReportBundle } from "@seo-polish/reporters";
import type {
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
  await writeReportBundle(reportDir, bundle);
  await writeRenderSupportFiles(reportDir, bundle);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function writeRenderSupportFiles(reportDir: string, bundle: ReportBundle): Promise<void> {
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

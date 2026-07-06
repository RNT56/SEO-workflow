import { readFile } from "node:fs/promises";
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
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

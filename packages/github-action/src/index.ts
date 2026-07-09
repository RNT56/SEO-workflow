import { appendFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runReportLint, runScan } from "@seo-polish/core";
import type { Finding } from "@seo-polish/schemas";
import { compareReports, type WorkflowComparison } from "@seo-polish/workflow";

export interface ActionInputs {
  url: string;
  outputDir: string;
  maxPages: number;
  baselinePath?: string;
  repoPath?: string;
  browserEvidence: boolean;
  maxScoreDrop: number;
  failOnNewHigh: boolean;
  failOnCritical: boolean;
  failOnReportLint: boolean;
  failOnPrivateUrl: boolean;
}

export interface ActionResult {
  reportPath: string;
  score: number;
  criticalFindings: number;
  regressionGate: "passed" | "failed" | "not-configured";
  scoreDelta: number | null;
  failedReasons: string[];
}

export async function runAction(inputs: ActionInputs): Promise<ActionResult> {
  const summary = await runScan({
    url: inputs.url,
    outputDir: inputs.outputDir,
    maxPages: inputs.maxPages,
    includeBrowserEvidence: inputs.browserEvidence,
    ...(inputs.repoPath ? { repoPath: inputs.repoPath } : {}),
    ...(inputs.baselinePath ? { baselinePath: inputs.baselinePath } : {})
  });
  const lint = await runReportLint(inputs.outputDir, true);
  const findings = JSON.parse(await readFile(join(inputs.outputDir, "findings.json"), "utf8")) as Finding[];
  const privateCriticals = findings.filter(
    (finding) =>
      finding.severity === "critical" && (finding.id === "SEO-SITEMAP-008" || finding.id === "AR-LLMS-008")
  );
  const comparison = inputs.baselinePath ? await compareReports(inputs.baselinePath, inputs.outputDir) : null;
  const regressionFailed = comparison
    ? comparison.scoreDelta < -Math.abs(inputs.maxScoreDrop) ||
      (inputs.failOnNewHigh && comparison.newCriticalHigh.length > 0)
    : false;
  const failedReasons = [
    ...(inputs.failOnReportLint && !lint.ok ? ["strict report lint failed"] : []),
    ...(inputs.failOnCritical && summary.findingCounts.critical > 0 ? ["critical findings detected"] : []),
    ...(inputs.failOnPrivateUrl && privateCriticals.length > 0 ? ["private URL exposure detected"] : []),
    ...(regressionFailed ? ["regression policy failed"] : [])
  ];
  const result: ActionResult = {
    reportPath: inputs.outputDir,
    score: summary.score.total,
    criticalFindings: summary.findingCounts.critical,
    regressionGate: comparison ? (regressionFailed ? "failed" : "passed") : "not-configured",
    scoreDelta: comparison?.scoreDelta ?? null,
    failedReasons
  };
  await writeFile(
    join(inputs.outputDir, "github-check-summary.md"),
    renderCheckSummary(result, comparison),
    "utf8"
  );
  if (failedReasons.length > 0) process.exitCode = 1;
  return result;
}

function readActionInputs(): ActionInputs {
  const baselinePath = input("baseline", false);
  const repoPath = input("repo", false);
  return {
    url: requiredInput("url"),
    outputDir: input("output", false) ?? "seo-polish-report",
    maxPages: finiteNumberInput("max-pages", 300),
    ...(baselinePath ? { baselinePath: resolve(baselinePath) } : {}),
    ...(repoPath ? { repoPath: resolve(repoPath) } : {}),
    browserEvidence: booleanInput("browser-evidence", false),
    maxScoreDrop: finiteNumberInput("max-score-drop", 0),
    failOnNewHigh: booleanInput("fail-on-new-high", true),
    failOnCritical: booleanInput("fail-on-critical", true),
    failOnReportLint: booleanInput("fail-on-report-lint", true),
    failOnPrivateUrl: booleanInput("fail-on-private-url", true)
  };
}

function renderCheckSummary(result: ActionResult, comparison: WorkflowComparison | null): string {
  return `# SEO Polish GitHub Check

- Primary core SEO score: ${result.score}/100
- Critical findings: ${result.criticalFindings}
- Regression gate: ${result.regressionGate}
- Score delta: ${result.scoreDelta === null ? "not configured" : signed(result.scoreDelta)}
- Result: ${result.failedReasons.length === 0 ? "passed" : "failed"}

${comparison ? `New finding groups: ${comparison.newFindingGroups.length}\nResolved finding groups: ${comparison.resolvedFindingGroups.length}\nNew critical/high groups: ${comparison.newCriticalHigh.length}\n` : "No baseline report was configured.\n"}
${result.failedReasons.length > 0 ? `\nStop reasons:\n${result.failedReasons.map((reason) => `- ${reason}`).join("\n")}\n` : ""}`;
}

function requiredInput(name: string): string {
  const value = input(name, true);
  if (!value) throw new Error(`Missing required input: ${name}`);
  return value;
}

function input(name: string, required: boolean): string | null {
  const key = `INPUT_${name.replace(/-/g, "_").toUpperCase()}`;
  const value = process.env[key];
  if (required && (!value || value.length === 0)) throw new Error(`Missing required input: ${name}`);
  return value ?? null;
}

function booleanInput(name: string, fallback: boolean): boolean {
  const value = input(name, false);
  if (value === null) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`Input ${name} must be true or false.`);
}

function finiteNumberInput(name: string, fallback: number): number {
  const value = input(name, false);
  if (value === null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Input ${name} must be a finite number.`);
  return number;
}

function writeOutput(name: string, value: string): void {
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `${name}=${value}\n`, "utf8");
  else console.log(`${name}=${value}`);
}

async function appendSummary(path: string): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const content = await readFile(path, "utf8");
  appendFileSync(summary, content, "utf8");
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

async function main(): Promise<void> {
  const result = await runAction(readActionInputs());
  writeOutput("report-path", result.reportPath);
  writeOutput("score", String(result.score));
  writeOutput("critical-findings", String(result.criticalFindings));
  writeOutput("github-pr-comment", join(result.reportPath, "github-pr-comment.md"));
  writeOutput("regression-gate", result.regressionGate);
  writeOutput("score-delta", result.scoreDelta === null ? "" : String(result.scoreDelta));
  await appendSummary(join(result.reportPath, "github-check-summary.md"));
}

if (process.argv[1]?.endsWith("index.js")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

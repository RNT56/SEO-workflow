import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { runReportLint, runScan } from "@seo-polish/core";
import type { Finding } from "@seo-polish/schemas";

async function main(): Promise<void> {
  const url = requiredInput("url");
  const outputDir = input("output", false) ?? "seo-polish-report";
  const maxPages = Number(input("max-pages", false) ?? "300");
  const failOnCritical = (input("fail-on-critical", false) ?? "true") === "true";
  const failOnReportLint = (input("fail-on-report-lint", false) ?? "true") === "true";
  const failOnPrivateUrl = (input("fail-on-private-url", false) ?? "true") === "true";

  const summary = await runScan({ url, outputDir, maxPages });
  const lint = await runReportLint(outputDir, true);
  const findings = JSON.parse(await readFile(`${outputDir}/findings.json`, "utf8")) as Finding[];
  const privateCriticals = findings.filter(
    (finding) =>
      finding.severity === "critical" && (finding.id === "SEO-SITEMAP-008" || finding.id === "AR-LLMS-008")
  );

  writeOutput("report-path", outputDir);
  writeOutput("score", String(summary.score.total));
  writeOutput("critical-findings", String(summary.findingCounts.critical));
  writeOutput("github-pr-comment", `${outputDir}/github-pr-comment.md`);

  if (
    (failOnReportLint && !lint.ok) ||
    (failOnCritical && summary.findingCounts.critical > 0) ||
    (failOnPrivateUrl && privateCriticals.length > 0)
  ) {
    process.exitCode = 1;
  }
}

function requiredInput(name: string): string {
  const value = input(name, true);
  if (!value) {
    throw new Error(`Missing required input: ${name}`);
  }
  return value;
}

function input(name: string, required: boolean): string | null {
  const key = `INPUT_${name.replace(/-/g, "_").toUpperCase()}`;
  const value = process.env[key];
  if (required && (!value || value.length === 0)) {
    throw new Error(`Missing required input: ${name}`);
  }
  return value ?? null;
}

function writeOutput(name: string, value: string): void {
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `${name}=${value}\n`, "utf8");
  } else {
    console.log(`${name}=${value}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

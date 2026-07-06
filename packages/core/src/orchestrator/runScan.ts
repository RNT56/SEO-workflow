import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeEvidenceStore } from "@seo-polish/evidence";
import { generatePatchBundle } from "@seo-polish/patchers";
import { createRemediationPlan } from "@seo-polish/remediation";
import { lintReport, writeReportBundle } from "@seo-polish/reporters";
import { evaluateRules } from "@seo-polish/rules";
import { scanSite } from "@seo-polish/scanner";
import type { Finding, ReportBundle, ScanSummary, Severity, ValidationResult } from "@seo-polish/schemas";
import { calculateScore } from "@seo-polish/scoring";
import { redactSensitiveValue } from "@seo-polish/security";
import { runValidation } from "@seo-polish/validation";
import type { ScanConfigInput } from "../config/resolveConfig.js";
import { resolveConfig } from "../config/resolveConfig.js";

export async function runScan(input: ScanConfigInput): Promise<ScanSummary> {
  const config = await resolveConfig(input);
  await mkdir(config.outputDir, { recursive: true });

  const rawScan = await scanSite(config);
  const rawFindings = evaluateRules(rawScan);
  const scan = redactSensitiveValue(rawScan);
  const findings = rawFindings.map((finding) => redactSensitiveValue(finding));
  const score = calculateScore(findings);
  const remediationPlan = createRemediationPlan(findings);
  const patchBundle = generatePatchBundle(config, findings, remediationPlan);

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
  await writeFile(join(config.outputDir, "scan-result.json"), `${JSON.stringify(scan, null, 2)}\n`, "utf8");
  await writeReportBundle(config.outputDir, bundle);
  await writeFinalSupportFiles(config.outputDir, bundle);

  const validation = await runValidation({ reportDir: config.outputDir, findings, strict: true });
  const finalBundle: ReportBundle = { ...bundle, validation };
  await writeReportBundle(config.outputDir, finalBundle);
  await writeFinalSupportFiles(config.outputDir, finalBundle);

  return {
    scanId: scan.scanId,
    reportPath: config.outputDir,
    score,
    findingCounts: countFindings(findings)
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

async function writeFinalSupportFiles(outputDir: string, bundle: ReportBundle): Promise<void> {
  await writeFile(
    join(outputDir, "before-after-score.json"),
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
  await writeFile(join(outputDir, "remaining-user-decisions.md"), decisionLines.join("\n"), "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

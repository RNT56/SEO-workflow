import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  REQUIRED_REPORT_FILES,
  REPORT_SECTIONS,
  sectionHeading,
  validateFindings,
  validateRemediationPlan,
  validateScore
} from "@seo-polish/schemas";
import type { Finding, ValidationCheck, ValidationResult } from "@seo-polish/schemas";
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
    }
  }

  const findings = await readJson<Finding[]>(join(reportDir, "findings.json"), checks, "findings.json");
  const score = await readJson<unknown>(join(reportDir, "score.json"), checks, "score.json");
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

  if (remediationPlan && typeof remediationPlan === "object") {
    checks.push(
      ...validateRemediationPlan(remediationPlan as Parameters<typeof validateRemediationPlan>[0]).checks
    );
  }

  if (strict && indexMd) {
    const leaked = findPrivateReferences(indexMd).filter(
      (reference) => !reference.includes("/admin") && !reference.includes("/checkout")
    );
    checks.push(
      check(
        "safety.private-public",
        "Private URL public report scan",
        leaked.length === 0,
        "Report should not expose private tokens or secrets."
      )
    );
  }

  return {
    ok: checks.every((item) => item.status !== "failed"),
    generatedAt: new Date().toISOString(),
    checks
  };
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

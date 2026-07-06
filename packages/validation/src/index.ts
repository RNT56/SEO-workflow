import { lintReport } from "@seo-polish/reporters";
import type { Finding, ValidationCheck, ValidationResult } from "@seo-polish/schemas";
import { findingContainsPrivateReference, requiresApprovalForText } from "@seo-polish/security";

export interface ValidationRunnerInput {
  reportDir: string;
  findings?: Finding[];
  strict?: boolean;
}

export async function runValidation(input: ValidationRunnerInput): Promise<ValidationResult> {
  const lint = await lintReport(input.reportDir, input.strict === undefined ? {} : { strict: input.strict });
  const checks: ValidationCheck[] = [...lint.checks];

  if (input.findings) {
    for (const finding of input.findings) {
      checks.push({
        id: `validation.${finding.id}.evidence`,
        title: `${finding.id} evidence present`,
        status: finding.evidence.length > 0 ? "passed" : "failed",
        severity: finding.evidence.length > 0 ? "info" : "error",
        message: "Every finding must include evidence."
      });

      const requiresApproval = requiresApprovalForText(
        [finding.title, finding.recommendation, finding.rootCause].join("\n")
      );
      checks.push({
        id: `validation.${finding.id}.approval`,
        title: `${finding.id} approval boundary`,
        status: !requiresApproval || finding.approvalRequired ? "passed" : "failed",
        severity: !requiresApproval || finding.approvalRequired ? "info" : "error",
        message:
          "Risky policy, auth, payment, MCP mutation, indexability and canonical changes require approval."
      });

      checks.push({
        id: `validation.${finding.id}.private-evidence`,
        title: `${finding.id} private reference handling`,
        status:
          findingContainsPrivateReference(finding) && finding.severity !== "critical" ? "warning" : "passed",
        severity:
          findingContainsPrivateReference(finding) && finding.severity !== "critical" ? "warning" : "info",
        message:
          "Private references are allowed only as evidence for security findings and must not become public implementation suggestions."
      });
    }
  }

  return {
    ok: checks.every((check) => check.status !== "failed"),
    generatedAt: new Date().toISOString(),
    checks
  };
}

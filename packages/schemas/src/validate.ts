import type { Evidence, Finding, RemediationPlan, Score, ValidationCheck } from "./types.js";

export interface SchemaValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
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

export function validateEvidence(evidence: Evidence): ValidationCheck[] {
  return [
    check("evidence.id", "Evidence ID", evidence.id.length > 0, "Evidence must have an ID."),
    check("evidence.type", "Evidence type", evidence.type.length > 0, "Evidence must have a type."),
    check(
      "evidence.timestamp",
      "Evidence timestamp",
      evidence.timestamp.length > 0,
      "Evidence must have a timestamp."
    )
  ];
}

export function validateFinding(finding: Finding): ValidationCheck[] {
  const checks: ValidationCheck[] = [
    check("finding.id", "Finding ID", finding.id.length > 0, "Finding must have an ID."),
    check("finding.title", "Finding title", finding.title.length > 0, "Finding must have a title."),
    check(
      "finding.confidence",
      "Finding confidence",
      finding.confidence >= 0 && finding.confidence <= 100,
      "Confidence must be 0-100."
    ),
    check(
      "finding.evidence",
      "Finding evidence",
      finding.evidence.length > 0,
      "Finding must include evidence."
    ),
    check("finding.impact", "Finding impact", finding.impact.length > 0, "Finding must explain impact."),
    check(
      "finding.rootCause",
      "Finding root cause",
      finding.rootCause.length > 0,
      "Finding must include a root cause."
    ),
    check(
      "finding.recommendation",
      "Finding recommendation",
      finding.recommendation.length > 0,
      "Finding must include a recommendation."
    ),
    check(
      "finding.validation",
      "Finding validation",
      finding.validation.length > 0,
      "Finding must include validation steps."
    ),
    check(
      "finding.affected",
      "Affected URLs or templates",
      finding.affectedUrls.length > 0 || finding.affectedTemplates.length > 0,
      "Finding must include affected URLs or templates."
    )
  ];

  for (const evidence of finding.evidence) {
    checks.push(...validateEvidence(evidence));
  }

  return checks;
}

export function validateFindings(findings: Finding[]): SchemaValidationResult {
  const checks = findings.flatMap((finding) => validateFinding(finding));
  return {
    ok: checks.every((item) => item.status !== "failed"),
    checks
  };
}

export function validateScore(score: Score): SchemaValidationResult {
  const checks = [
    check("score.total", "Total score", score.total >= 0 && score.total <= 100, "Total score must be 0-100."),
    check(
      "score.categories",
      "Score categories",
      score.categories.length > 0,
      "Score must include categories."
    )
  ];
  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

export function validateRemediationPlan(plan: RemediationPlan): SchemaValidationResult {
  const checks = [
    check("plan.phases", "Remediation phases", plan.phases.length > 0, "Plan must include phases."),
    check(
      "plan.classification",
      "Fix classification",
      plan.safeFixes.length + plan.approvalRequired.length + plan.manualRecommendations.length >= 0,
      "Plan must classify remediations."
    )
  ];
  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

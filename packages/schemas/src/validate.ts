import type {
  Evidence,
  Finding,
  RemediationPlan,
  ReportDashboard,
  ReportDashboardQueueItem,
  Score,
  ValidationCheck
} from "./types.js";

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

export function validateReportDashboard(dashboard: ReportDashboard): SchemaValidationResult {
  const queueItems = [
    ...dashboard.nextBestFixes,
    ...dashboard.implementationQueue,
    ...dashboard.approvalQueue,
    ...dashboard.impactEffortMatrix.flatMap((quadrant) => quadrant.items),
    ...dashboard.templateHeatmap.flatMap((template) =>
      template.findingIds.map((findingId) =>
        dashboard.implementationQueue.find((item) => item.findingId === findingId)
      )
    )
  ].filter((item): item is ReportDashboardQueueItem => Boolean(item));

  const checks: ValidationCheck[] = [
    check(
      "dashboard.target",
      "Dashboard target URL",
      dashboard.targetUrl.length > 0,
      "Dashboard must include the target URL."
    ),
    check(
      "dashboard.score",
      "Dashboard score",
      dashboard.score.total >= 0 && dashboard.score.total <= 100,
      "Dashboard score must stay within 0-100."
    ),
    check(
      "dashboard.queues",
      "Dashboard implementation queue",
      Array.isArray(dashboard.implementationQueue),
      "Dashboard must include an implementation queue."
    ),
    check(
      "dashboard.matrix",
      "Dashboard impact effort matrix",
      dashboard.impactEffortMatrix.length === 4,
      "Dashboard must include the four impact/effort quadrants."
    ),
    check(
      "dashboard.performance",
      "Dashboard performance summary",
      dashboard.performanceSummary.metrics.length > 0,
      "Dashboard must include performance metric summaries."
    ),
    check(
      "dashboard.evidence",
      "Dashboard evidence stats",
      dashboard.evidenceStats.evidenceEntries >= 0 && dashboard.evidenceStats.groupedFindings >= 0,
      "Dashboard must include bounded evidence counters."
    )
  ];

  for (const item of queueItems) {
    checks.push(...validateDashboardQueueItem(item));
  }

  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

function validateDashboardQueueItem(item: ReportDashboardQueueItem): ValidationCheck[] {
  return [
    check(
      `dashboard.queue.${item.id}.finding`,
      `${item.id} finding ID`,
      item.findingId.length > 0,
      "Queue item must include a finding ID."
    ),
    check(
      `dashboard.queue.${item.id}.title`,
      `${item.id} title`,
      item.title.length > 0,
      "Queue item must include a title."
    ),
    check(
      `dashboard.queue.${item.id}.owner`,
      `${item.id} owner`,
      item.owner.length > 0,
      "Queue item must include an owner."
    ),
    check(
      `dashboard.queue.${item.id}.validation`,
      `${item.id} validation command`,
      item.validationCommand.length > 0,
      "Queue item must include a validation command."
    ),
    check(
      `dashboard.queue.${item.id}.next-step`,
      `${item.id} next step`,
      item.nextStep.length > 0,
      "Queue item must include a next step."
    )
  ];
}

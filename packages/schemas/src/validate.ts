import type {
  AgentReview,
  AgentReviewEvidenceLink,
  AgentReviewInput,
  Evidence,
  Finding,
  RemediationPlan,
  ReportDashboard,
  ReportDashboardQueueItem,
  Score,
  ValidationCheck,
  WorkflowLearningItem,
  WorkflowRetrospective,
  WorkflowRetrospectiveEvidenceLink,
  WorkflowRetrospectiveInput
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
    ),
    check(
      "score.primary-profile",
      "Primary score profile",
      score.profiles?.core_seo?.score === score.total && score.profiles.core_seo.includedInPrimary,
      "The public total must equal the stable core SEO profile."
    ),
    check(
      "score.coverage",
      "Rule evaluation coverage",
      Boolean(score.coverage) &&
        score.coverage.measuredRules <= score.coverage.applicableRules &&
        score.coverage.percentMeasured >= 0 &&
        score.coverage.percentMeasured <= 100,
      "Score must report bounded measured/applicable rule coverage."
    ),
    check(
      "score.experimental-separation",
      "Experimental score separation",
      typeof score.experimentalCombined === "number" && !score.profiles.agent_readiness.includedInPrimary,
      "Experimental agent-readiness must remain outside the primary SEO grade."
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

export function validateAgentReviewInput(input: AgentReviewInput): SchemaValidationResult {
  const sourceArtifacts = Array.isArray(input.sourceArtifacts) ? input.sourceArtifacts : [];
  const topFindings = Array.isArray(input.topFindings) ? input.topFindings : [];
  const nextBestFixes = Array.isArray(input.nextBestFixes) ? input.nextBestFixes : [];
  const implementationQueue = Array.isArray(input.implementationQueue) ? input.implementationQueue : [];
  const approvalQueue = Array.isArray(input.approvalQueue) ? input.approvalQueue : [];
  const checks: ValidationCheck[] = [
    check(
      "agent-review-input.status",
      "Agent review input status",
      input.status === "ready",
      "agent-review-input.json must be a ready evidence packet."
    ),
    check(
      "agent-review-input.target",
      "Agent review input target",
      typeof input.targetUrl === "string" && input.targetUrl.length > 0,
      "Agent review input must include the target URL."
    ),
    check(
      "agent-review-input.sources",
      "Agent review input sources",
      sourceArtifacts.length > 0,
      "Agent review input must list source artifacts."
    ),
    check(
      "agent-review-input.findings",
      "Agent review input findings",
      typeof input.findingCount === "number" &&
        input.findingCount >= 0 &&
        typeof input.groupedFindingCount === "number" &&
        input.groupedFindingCount >= 0,
      "Agent review input must include finding counters."
    ),
    check(
      "agent-review-input.bounded",
      "Agent review input bounded queues",
      topFindings.length <= 30 &&
        nextBestFixes.length <= 20 &&
        implementationQueue.length <= 80 &&
        approvalQueue.length <= 80,
      "Agent review input queues must stay bounded for model review."
    )
  ];
  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

export function validateAgentReview(review: AgentReview): SchemaValidationResult {
  const sourceArtifacts = Array.isArray(review.sourceArtifacts) ? review.sourceArtifacts : [];
  const strategicFindings = Array.isArray(review.strategicFindings) ? review.strategicFindings : [];
  const copyRecommendations = Array.isArray(review.copyRecommendations) ? review.copyRecommendations : [];
  const finalAudit = review.finalAudit;
  const searchIntent = review.searchIntent;
  const agentSkills = review.agentSkills;
  const checks: ValidationCheck[] = [
    check(
      "agent-review.status",
      "Agent review status",
      ["pending", "complete", "invalid"].includes(review.status),
      "agent-review.json must declare a valid status."
    ),
    check(
      "agent-review.reviewer",
      "Agent review reviewer",
      ["pending", "agent", "fixture"].includes(review.reviewer),
      "agent-review.json must declare the reviewer type."
    ),
    check(
      "agent-review.target",
      "Agent review target",
      typeof review.targetUrl === "string" && review.targetUrl.length > 0,
      "Agent review must include the target URL."
    ),
    check(
      "agent-review.sources",
      "Agent review source artifacts",
      sourceArtifacts.length > 0,
      "Agent review must list the source artifacts it used."
    ),
    check(
      "agent-review.summary",
      "Agent review executive summary",
      review.status !== "complete" ||
        (typeof review.executiveSummary === "string" && review.executiveSummary.trim().length > 0),
      "Completed agent review must include an executive summary."
    ),
    check(
      "agent-review.final-audit",
      "Agent review final audit",
      review.status !== "complete" ||
        (finalAudit?.status === "complete" &&
          typeof finalAudit.finalAuditMarkdown === "string" &&
          finalAudit.finalAuditMarkdown.trim().length > 0 &&
          Array.isArray(finalAudit.evidence) &&
          finalAudit.evidence.length > 0),
      "Completed agent review must include a cited final audit narrative."
    ),
    check(
      "agent-review.search-intent",
      "Search intent review",
      review.status !== "complete" ||
        (searchIntent?.status === "complete" &&
          typeof searchIntent.summary === "string" &&
          searchIntent.summary.trim().length > 0 &&
          Array.isArray(searchIntent.evidence) &&
          searchIntent.evidence.length > 0),
      "Completed agent review must include a cited search intent review."
    ),
    check(
      "agent-review.agent-skills",
      "Agent skills review",
      review.status !== "complete" ||
        (agentSkills?.status === "complete" &&
          typeof agentSkills.summary === "string" &&
          agentSkills.summary.trim().length > 0 &&
          Array.isArray(agentSkills.evidence) &&
          agentSkills.evidence.length > 0),
      "Completed agent review must include a cited agent skills review."
    )
  ];

  for (const item of strategicFindings) {
    checks.push(
      check(
        `agent-review.finding.${item.id}.evidence`,
        `${item.id} cited evidence`,
        Array.isArray(item.evidence) && item.evidence.length > 0 && item.evidence.every(hasAnyEvidenceAnchor),
        "Every strategic finding must cite evidence, a finding ID, URL or source artifact."
      ),
      check(
        `agent-review.finding.${item.id}.validation`,
        `${item.id} validation`,
        Array.isArray(item.validation) && item.validation.length > 0,
        "Every strategic finding must include validation steps."
      )
    );
  }

  for (const item of copyRecommendations) {
    checks.push(
      check(
        `agent-review.copy.${item.id}.proposal`,
        `${item.id} proposal`,
        typeof item.proposed === "string" && item.proposed.trim().length > 0,
        "Every copy recommendation must include proposed copy."
      ),
      check(
        `agent-review.copy.${item.id}.evidence`,
        `${item.id} cited evidence`,
        Array.isArray(item.evidence) && item.evidence.length > 0 && item.evidence.every(hasAnyEvidenceAnchor),
        "Every copy recommendation must cite evidence, a finding ID, URL or source artifact."
      ),
      check(
        `agent-review.copy.${item.id}.approval-boundary`,
        `${item.id} approval boundary`,
        !item.safeToApply || item.approvalState === "not_required",
        "Copy marked safe to apply cannot also be approval-required."
      )
    );
  }

  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

export function validateWorkflowRetrospectiveInput(
  input: WorkflowRetrospectiveInput
): SchemaValidationResult {
  const sourceArtifacts = Array.isArray(input.sourceArtifacts) ? input.sourceArtifacts : [];
  const artifactInventory = Array.isArray(input.artifactInventory) ? input.artifactInventory : [];
  const nextBestFixes = Array.isArray(input.dashboardQueues?.nextBestFixes)
    ? input.dashboardQueues.nextBestFixes
    : [];
  const implementationQueue = Array.isArray(input.dashboardQueues?.implementationQueue)
    ? input.dashboardQueues.implementationQueue
    : [];
  const approvalQueue = Array.isArray(input.dashboardQueues?.approvalQueue)
    ? input.dashboardQueues.approvalQueue
    : [];
  const checks: ValidationCheck[] = [
    check(
      "workflow-retrospective-input.status",
      "Workflow retrospective input status",
      input.status === "ready",
      "workflow-retrospective-input.json must be a ready evidence packet."
    ),
    check(
      "workflow-retrospective-input.target",
      "Workflow retrospective input target",
      typeof input.targetUrl === "string" && input.targetUrl.length > 0,
      "Workflow retrospective input must include the target URL."
    ),
    check(
      "workflow-retrospective-input.sources",
      "Workflow retrospective input sources",
      sourceArtifacts.length > 0 && artifactInventory.length > 0,
      "Workflow retrospective input must include source artifacts and artifact inventory."
    ),
    check(
      "workflow-retrospective-input.bounded",
      "Workflow retrospective input bounded queues",
      nextBestFixes.length <= 20 && implementationQueue.length <= 80 && approvalQueue.length <= 80,
      "Workflow retrospective input queues must stay bounded for agent review."
    )
  ];
  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

export function validateWorkflowRetrospective(retrospective: WorkflowRetrospective): SchemaValidationResult {
  const sourceArtifacts = Array.isArray(retrospective.sourceArtifacts) ? retrospective.sourceArtifacts : [];
  const evidence = Array.isArray(retrospective.evidence) ? retrospective.evidence : [];
  const ruleGaps = Array.isArray(retrospective.ruleGaps) ? retrospective.ruleGaps : [];
  const reportUxGaps = Array.isArray(retrospective.reportUxGaps) ? retrospective.reportUxGaps : [];
  const agentFriction = Array.isArray(retrospective.agentFriction) ? retrospective.agentFriction : [];
  const maintainerActions = Array.isArray(retrospective.maintainerActions)
    ? retrospective.maintainerActions
    : [];
  const learningItems = workflowLearningItems(retrospective);
  const checks: ValidationCheck[] = [
    check(
      "workflow-retrospective.status",
      "Workflow retrospective status",
      ["pending", "complete", "invalid"].includes(retrospective.status),
      "workflow-retrospective.json must declare a valid status."
    ),
    check(
      "workflow-retrospective.reviewer",
      "Workflow retrospective reviewer",
      ["pending", "agent", "fixture"].includes(retrospective.reviewer),
      "workflow-retrospective.json must declare the reviewer type."
    ),
    check(
      "workflow-retrospective.target",
      "Workflow retrospective target",
      typeof retrospective.targetUrl === "string" && retrospective.targetUrl.length > 0,
      "Workflow retrospective must include the target URL."
    ),
    check(
      "workflow-retrospective.sources",
      "Workflow retrospective source artifacts",
      sourceArtifacts.length > 0,
      "Workflow retrospective must list the source artifacts it used."
    ),
    check(
      "workflow-retrospective.summary",
      "Workflow retrospective summary",
      retrospective.status !== "complete" ||
        (typeof retrospective.summary === "string" && retrospective.summary.trim().length > 0),
      "Completed workflow retrospective must include a summary."
    ),
    check(
      "workflow-retrospective.evidence",
      "Workflow retrospective evidence",
      retrospective.status !== "complete" ||
        (evidence.length > 0 && evidence.every(hasAnyRetrospectiveEvidenceAnchor)),
      "Completed workflow retrospective must cite source artifacts, finding IDs, validation checks, report sections or blockers."
    ),
    check(
      "workflow-retrospective.bounded",
      "Workflow retrospective bounded learnings",
      ruleGaps.length <= 50 &&
        reportUxGaps.length <= 50 &&
        agentFriction.length <= 50 &&
        maintainerActions.length <= 80,
      "Workflow retrospective learning queues must stay bounded."
    )
  ];

  for (const item of learningItems) {
    checks.push(...validateWorkflowLearningItem(item));
  }

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
      "dashboard.browser-evidence",
      "Dashboard browser evidence summary",
      ["disabled", "ok", "unavailable", "failed"].includes(
        dashboard.performanceSummary.browserEvidence.status
      ),
      "Dashboard must include browser evidence status."
    ),
    check(
      "dashboard.field-data",
      "Dashboard field data summary",
      ["disabled", "ok", "partial", "unavailable", "failed"].includes(
        dashboard.performanceSummary.fieldData.status
      ),
      "Dashboard must include field data status."
    ),
    check(
      "dashboard.evidence",
      "Dashboard evidence stats",
      dashboard.evidenceStats.evidenceEntries >= 0 && dashboard.evidenceStats.groupedFindings >= 0,
      "Dashboard must include bounded evidence counters."
    ),
    check(
      "dashboard.agent-review",
      "Dashboard agent review summary",
      Boolean(
        dashboard.agentReview && ["pending", "complete", "invalid"].includes(dashboard.agentReview.status)
      ),
      "Dashboard must include agent review status."
    )
  ];

  for (const item of queueItems) {
    checks.push(...validateDashboardQueueItem(item));
  }

  return { ok: checks.every((item) => item.status !== "failed"), checks };
}

function hasAnyEvidenceAnchor(link: AgentReviewEvidenceLink): boolean {
  return Boolean(
    (link.evidenceId && link.evidenceId.trim().length > 0) ||
    (link.findingId && link.findingId.trim().length > 0) ||
    (link.url && link.url.trim().length > 0) ||
    (link.sourceArtifact && link.sourceArtifact.trim().length > 0)
  );
}

function hasAnyRetrospectiveEvidenceAnchor(link: WorkflowRetrospectiveEvidenceLink): boolean {
  return Boolean(
    (link.sourceArtifact && link.sourceArtifact.trim().length > 0) ||
    (link.findingId && link.findingId.trim().length > 0) ||
    (link.evidenceId && link.evidenceId.trim().length > 0) ||
    (link.validationCheckId && link.validationCheckId.trim().length > 0) ||
    (link.reportSection && link.reportSection.trim().length > 0) ||
    (link.blockerId && link.blockerId.trim().length > 0)
  );
}

function workflowLearningItems(retrospective: WorkflowRetrospective): WorkflowLearningItem[] {
  return [
    ...(Array.isArray(retrospective.ruleGaps) ? retrospective.ruleGaps : []),
    ...(Array.isArray(retrospective.reportUxGaps) ? retrospective.reportUxGaps : []),
    ...(Array.isArray(retrospective.agentFriction) ? retrospective.agentFriction : []),
    ...(Array.isArray(retrospective.maintainerActions) ? retrospective.maintainerActions : [])
  ];
}

function validateWorkflowLearningItem(item: WorkflowLearningItem): ValidationCheck[] {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  return [
    check(
      `workflow-learning.${item.id}.title`,
      `${item.id} title`,
      typeof item.title === "string" && item.title.trim().length > 0,
      "Every workflow learning must include a title."
    ),
    check(
      `workflow-learning.${item.id}.summary`,
      `${item.id} summary`,
      typeof item.summary === "string" && item.summary.trim().length > 0,
      "Every workflow learning must include a summary."
    ),
    check(
      `workflow-learning.${item.id}.evidence`,
      `${item.id} evidence`,
      evidence.length > 0 && evidence.every(hasAnyRetrospectiveEvidenceAnchor),
      "Every workflow learning must cite source artifacts, finding IDs, validation checks, report sections or blockers."
    ),
    check(
      `workflow-learning.${item.id}.recommendation`,
      `${item.id} recommendation`,
      typeof item.recommendation === "string" && item.recommendation.trim().length > 0,
      "Every workflow learning must include a maintainer-facing recommendation."
    ),
    check(
      `workflow-learning.${item.id}.action-status`,
      `${item.id} maintainer action status`,
      ["proposed", "accepted", "rejected", "implemented"].includes(item.maintainerActionStatus),
      "Workflow learning maintainer action status must be valid."
    )
  ];
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

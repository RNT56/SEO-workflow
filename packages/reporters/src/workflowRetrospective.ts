import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPORT_CONTRACT_VERSION } from "@seo-polish/schemas";
import type {
  AgentReview,
  ReportBundle,
  ReportDashboard,
  ValidationStatus,
  WorkflowCompletion,
  WorkflowLearningItem,
  WorkflowRetrospective,
  WorkflowRetrospectiveEvidenceLink,
  WorkflowRetrospectiveInput
} from "@seo-polish/schemas";
import { groupFindings } from "./reportSignal.js";

export const WORKFLOW_RETROSPECTIVE_ARTIFACTS = [
  "workflow-retrospective-input.json",
  "workflow-retrospective.json",
  "workflow-retrospective.md",
  "workflow-completion.json",
  "workflow-learnings/rule-gaps.json",
  "workflow-learnings/report-ux-gaps.json",
  "workflow-learnings/agent-friction.json",
  "workflow-learnings/maintainer-actions.json"
] as const;

const SOURCE_ARTIFACTS = [
  "scan-result.json",
  "findings.json",
  "score.json",
  "report-dashboard.json",
  "agent-review-input.json",
  "agent-review.json",
  "search-intent-review.json",
  "agent-skills-review.json",
  "copy-recommendations.json",
  "final-audit.md",
  "quality-gate.json",
  "production-readiness.json",
  "validation.json",
  "agent-execution-plan.md",
  "audit-run.json"
] as const;

export interface WorkflowRetrospectiveArtifactOptions {
  workflowRetrospective?: WorkflowRetrospective | null;
}

export function buildWorkflowRetrospectiveInput(
  bundle: ReportBundle,
  dashboard: ReportDashboard,
  agentReview: AgentReview
): WorkflowRetrospectiveInput {
  const groups = groupFindings(bundle.findings);
  const byId = new Map(bundle.findings.map((finding) => [finding.id, finding]));
  return {
    generatedAt: new Date().toISOString(),
    status: "ready",
    targetUrl: bundle.scan.config.url,
    reportContractVersion: REPORT_CONTRACT_VERSION,
    sourceArtifacts: [...SOURCE_ARTIFACTS],
    score: bundle.score,
    findingCount: bundle.findings.length,
    groupedFindingCount: groups.length,
    validationSummary: validationSummary(bundle),
    qualityGateStatus: dashboard.qualityGateStatus,
    productionReadinessStatus: dashboard.qualityGateStatus,
    agentReviewStatus: agentReview.status,
    artifactInventory: [
      ...SOURCE_ARTIFACTS,
      "workflow-retrospective-input.json",
      "workflow-retrospective.json",
      "workflow-completion.json"
    ],
    topFindings: groups.slice(0, 30).map((group) => {
      const finding = byId.get(group.id);
      return {
        id: group.id,
        title: group.title,
        severity: group.severity,
        category: group.category,
        affectedUrls: [...group.affectedUrls].sort().slice(0, 12),
        affectedTemplates: [...group.affectedTemplates].sort().slice(0, 12),
        evidenceIds: finding?.evidence.map((item) => item.id).slice(0, 12) ?? [],
        recommendation: group.recommendation,
        approvalRequired: group.approvalRequired,
        safeToAutoFix: group.safeToAutoFix
      };
    }),
    dashboardQueues: {
      nextBestFixes: dashboard.nextBestFixes.slice(0, 20),
      implementationQueue: dashboard.implementationQueue.slice(0, 80),
      approvalQueue: dashboard.approvalQueue.slice(0, 80)
    },
    reportUi: {
      views: ["overview", "review", "implementation", "performance", "templates", "comparison", "evidence"],
      knownLimitations: dashboard.performanceSummary.limitations.slice(0, 20)
    },
    instructions: [
      "Write a maintainer-facing retrospective about how the SEO Polish workflow performed.",
      "Cite source artifacts, finding IDs, evidence IDs, validation checks, report sections or blockers.",
      "Flag noisy findings, missing evidence, unclear report UI, agent friction and possible workflow improvements.",
      "Do not mutate workflow code, rules, schemas or docs from this retrospective.",
      "Keep customer URLs, local paths, snippets, secrets and private repo context out of exported learnings unless explicitly authorized."
    ]
  };
}

export function buildPendingWorkflowRetrospective(bundle: ReportBundle): WorkflowRetrospective {
  const evidence = sourceLink(
    "workflow-retrospective-input.json",
    "Retrospective packet generated and awaiting agent review."
  );
  return {
    generatedAt: new Date().toISOString(),
    status: "pending",
    reviewer: "pending",
    targetUrl: bundle.scan.config.url,
    sourceArtifacts: [...SOURCE_ARTIFACTS],
    summary:
      "Pending workflow retrospective. A repo-capable agent must complete workflow-retrospective.json before the workflow run can be marked fully complete.",
    workflowOutcome: "blocked",
    whatWorked: [],
    ruleGaps: [],
    reportUxGaps: [],
    agentFriction: [],
    maintainerActions: [],
    limitations: ["Workflow retrospective artifacts have not been completed yet."],
    evidence: [evidence]
  };
}

export function buildFixtureWorkflowRetrospective(
  bundle: ReportBundle,
  dashboard: ReportDashboard,
  agentReview: AgentReview
): WorkflowRetrospective {
  const baseEvidence = firstEvidenceLink(bundle);
  const dashboardEvidence = sourceLink(
    "report-dashboard.json",
    "Deterministic dashboard queues and counts were used for retrospective review."
  );
  const validationEvidence = sourceLink(
    "validation.json",
    "Validation checks were used to assess workflow completion friction."
  );
  const agentReviewEvidence = sourceLink(
    "agent-review.json",
    "Mandatory agent review status was used for workflow completion assessment."
  );
  const maintainerAction = learningItem({
    id: "learning-review-priority-queue",
    title: "Review priority queue signal after real runs",
    category: "report_ux_gap",
    severity: dashboard.nextBestFixes.length > 0 ? "low" : "medium",
    summary:
      dashboard.nextBestFixes.length > 0
        ? "The implementation queue was populated and can be reviewed for signal quality over repeated audits."
        : "The implementation queue was empty, so maintainers should check whether this fixture or rule coverage underproduces actionable work.",
    evidence: [dashboardEvidence],
    recommendation:
      "Compare next-best-fix ordering across real audits before changing scoring or queue logic.",
    affectsWorkflowAreas: ["report-dashboard", "agent-execution-plan"]
  });
  const agentFriction =
    dashboard.approvalQueue.length > 0
      ? [
          learningItem({
            id: "learning-approval-queue-friction",
            title: "Approval queue requires owner decisions",
            category: "agent_friction",
            severity: "medium",
            summary:
              "The run contains approval-gated work, so repo-capable agents need explicit owner decisions before acting.",
            evidence: [dashboardEvidence],
            recommendation:
              "Keep approval-gated items clearly separated and collect owner decisions before implementation.",
            affectsWorkflowAreas: ["agent-execution-plan", "remaining-user-decisions"]
          })
        ]
      : [];
  return {
    generatedAt: new Date().toISOString(),
    status: "complete",
    reviewer: "fixture",
    targetUrl: bundle.scan.config.url,
    sourceArtifacts: [...SOURCE_ARTIFACTS],
    summary: `Fixture workflow retrospective completed for ${bundle.scan.config.url}. The workflow produced ${bundle.findings.length} findings, ${dashboard.nextBestFixes.length} next-best fixes and agent review status ${agentReview.status}.`,
    workflowOutcome: agentReview.status === "complete" ? "completed" : "partial",
    whatWorked: [
      "Deterministic evidence artifacts were available before agent-authored review.",
      "The implementation queue and approval queue were separated.",
      "Validation artifacts were available for maintainer review."
    ],
    ruleGaps: [],
    reportUxGaps: [maintainerAction],
    agentFriction,
    maintainerActions: [maintainerAction, ...agentFriction],
    limitations: [
      "Fixture retrospective is deterministic and does not replace a real agent-written retrospective."
    ],
    evidence: [baseEvidence, dashboardEvidence, validationEvidence, agentReviewEvidence]
  };
}

export async function writeWorkflowRetrospectiveArtifacts(
  outputDir: string,
  input: WorkflowRetrospectiveInput,
  retrospective: WorkflowRetrospective,
  reportProductionReady: boolean
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "workflow-learnings"), { recursive: true });
  await writeFile(
    join(outputDir, "workflow-retrospective-input.json"),
    `${JSON.stringify(input, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-retrospective.json"),
    `${JSON.stringify(retrospective, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-retrospective.md"),
    renderWorkflowRetrospectiveMarkdown(retrospective),
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-completion.json"),
    `${JSON.stringify(buildWorkflowCompletion(retrospective, reportProductionReady), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-learnings", "rule-gaps.json"),
    `${JSON.stringify(retrospective.ruleGaps, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-learnings", "report-ux-gaps.json"),
    `${JSON.stringify(retrospective.reportUxGaps, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-learnings", "agent-friction.json"),
    `${JSON.stringify(retrospective.agentFriction, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "workflow-learnings", "maintainer-actions.json"),
    `${JSON.stringify(retrospective.maintainerActions, null, 2)}\n`,
    "utf8"
  );
}

export function renderWorkflowRetrospectiveMarkdown(retrospective: WorkflowRetrospective): string {
  const lines = [
    "# Workflow Retrospective",
    "",
    `Status: ${retrospective.status}`,
    `Reviewer: ${retrospective.reviewer}`,
    `Outcome: ${retrospective.workflowOutcome}`,
    "",
    "## Summary",
    "",
    retrospective.summary,
    "",
    "## What Worked",
    "",
    ...listOrEmpty(retrospective.whatWorked),
    "",
    renderLearningSection("Rule Gaps", retrospective.ruleGaps),
    renderLearningSection("Report UX Gaps", retrospective.reportUxGaps),
    renderLearningSection("Agent Friction", retrospective.agentFriction),
    renderLearningSection("Maintainer Actions", retrospective.maintainerActions),
    "## Limitations",
    "",
    ...listOrEmpty(retrospective.limitations)
  ];
  return `${lines.join("\n")}\n`;
}

function buildWorkflowCompletion(
  retrospective: WorkflowRetrospective,
  reportProductionReady: boolean
): WorkflowCompletion {
  const retrospectiveComplete = retrospective.status === "complete";
  return {
    generatedAt: new Date().toISOString(),
    status: retrospectiveComplete ? "complete" : "blocked",
    retrospectiveStatus: retrospective.status,
    reportProductionReady,
    requiredActions: retrospectiveComplete
      ? []
      : [
          "Complete workflow-retrospective.json and rerender the report before declaring the workflow run fully complete."
        ],
    checks: [
      {
        id: "workflow-retrospective.complete",
        title: "Workflow retrospective complete",
        status: retrospectiveComplete ? "passed" : "failed",
        severity: retrospectiveComplete ? "info" : "error",
        message: retrospectiveComplete
          ? "Workflow retrospective is complete."
          : "workflow-retrospective.json must be completed before workflow-completion.json can pass."
      }
    ]
  };
}

function validationSummary(bundle: ReportBundle): Record<ValidationStatus, number> & { total: number } {
  const counts = bundle.validation.checks.reduce<Record<ValidationStatus, number>>(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, warning: 0, not_applicable: 0 }
  );
  return { total: bundle.validation.checks.length, ...counts };
}

function renderLearningSection(title: string, items: WorkflowLearningItem[]): string {
  const lines = [`## ${title}`, ""];
  if (items.length === 0) {
    lines.push("No items.", "");
    return lines.join("\n");
  }
  for (const item of items) {
    lines.push(`- ${item.id}: ${item.title}`);
    lines.push(`  - Severity: ${item.severity}`);
    lines.push(`  - Privacy: ${item.privacy}`);
    lines.push(`  - Recommendation: ${item.recommendation}`);
  }
  lines.push("");
  return lines.join("\n");
}

function listOrEmpty(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["No items."];
}

function learningItem(input: {
  id: string;
  title: string;
  category: WorkflowLearningItem["category"];
  severity: WorkflowLearningItem["severity"];
  summary: string;
  evidence: WorkflowRetrospectiveEvidenceLink[];
  recommendation: string;
  affectsWorkflowAreas: string[];
}): WorkflowLearningItem {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    severity: input.severity,
    privacy: "redacted",
    summary: input.summary,
    evidence: input.evidence,
    recommendation: input.recommendation,
    affectsWorkflowAreas: input.affectsWorkflowAreas,
    maintainerActionStatus: "proposed",
    redactionRequired: true
  };
}

function firstEvidenceLink(bundle: ReportBundle, findingId?: string): WorkflowRetrospectiveEvidenceLink {
  const finding = findingId
    ? bundle.findings.find((item) => item.id === findingId)
    : bundle.findings.find((item) => item.evidence.length > 0);
  const evidence = finding?.evidence[0] ?? bundle.scan.evidence[0];
  if (evidence) {
    const link: WorkflowRetrospectiveEvidenceLink = {
      evidenceId: evidence.id,
      note: "Representative deterministic evidence from the scan."
    };
    if (finding?.id) link.findingId = finding.id;
    return link;
  }
  return sourceLink(
    "scan-result.json",
    "No finding-level evidence exists; scan-result.json is the source artifact."
  );
}

function sourceLink(sourceArtifact: string, note: string): WorkflowRetrospectiveEvidenceLink {
  return { sourceArtifact, note };
}

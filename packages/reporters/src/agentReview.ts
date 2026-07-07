import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPORT_CONTRACT_VERSION } from "@seo-polish/schemas";
import { requiresApprovalForText } from "@seo-polish/security";
import type {
  AgentCopyRecommendation,
  AgentReview,
  AgentReviewEvidenceLink,
  AgentReviewInput,
  ReportBundle,
  ReportDashboard
} from "@seo-polish/schemas";
import { countBySeverity, groupFindings } from "./reportSignal.js";

export const AGENT_REVIEW_ARTIFACTS = [
  "agent-review-input.json",
  "agent-review.json",
  "search-intent-review.json",
  "agent-skills-review.json",
  "copy-recommendations.json",
  "copy-recommendations.md",
  "final-audit.md",
  "executive-summary.md"
] as const;

const SOURCE_ARTIFACTS = [
  "scan-result.json",
  "findings.json",
  "score.json",
  "report-dashboard.json",
  "remediation-plan.json",
  "validation.json",
  "evidence.jsonl",
  "tech-stack.json",
  "repo-analysis.json",
  "route-templates.json",
  "browser-evidence.json",
  "field-data.json",
  "search-console.json",
  "url-inspection.json",
  "rum-vitals.json",
  "performance-audit.json",
  "resource-timing.json",
  "baseline-comparison.json",
  "quality-gate.json"
];

export interface AgentReviewArtifactOptions {
  agentReview?: AgentReview | null;
}

export function buildAgentReviewInput(bundle: ReportBundle, dashboard: ReportDashboard): AgentReviewInput {
  const groups = groupFindings(bundle.findings);
  const byId = new Map(bundle.findings.map((finding) => [finding.id, finding]));
  const siteIntelligence: AgentReviewInput["siteIntelligence"] = {
    routeTemplates: bundle.scan.routeTemplates ?? []
  };
  if (bundle.scan.techStack) siteIntelligence.techStack = bundle.scan.techStack;
  if (bundle.scan.repo) siteIntelligence.repo = bundle.scan.repo;
  if (bundle.scan.browserEvidence) siteIntelligence.browserEvidence = bundle.scan.browserEvidence;
  if (bundle.scan.fieldData) siteIntelligence.fieldData = bundle.scan.fieldData;
  if (bundle.scan.performance) siteIntelligence.performance = bundle.scan.performance;

  return {
    generatedAt: new Date().toISOString(),
    status: "ready",
    targetUrl: bundle.scan.config.url,
    reportContractVersion: REPORT_CONTRACT_VERSION,
    sourceArtifacts: SOURCE_ARTIFACTS,
    score: bundle.score,
    findingCount: bundle.findings.length,
    groupedFindingCount: groups.length,
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
    nextBestFixes: dashboard.nextBestFixes.slice(0, 20),
    implementationQueue: dashboard.implementationQueue.slice(0, 80),
    approvalQueue: dashboard.approvalQueue.slice(0, 80),
    templateHeatmap: dashboard.templateHeatmap.slice(0, 40),
    performanceSummary: dashboard.performanceSummary,
    baselineSummary: dashboard.baselineSummary,
    evidenceStats: dashboard.evidenceStats,
    siteIntelligence,
    instructions: [
      "Write the strategic review only from cited source artifacts and evidence IDs.",
      "Do not invent field data, customer proof, commercial claims, repo facts or private context.",
      "Treat copywriting as proposal-first unless it is safe, low-risk and source-derived.",
      "Keep canonical/indexing, policy, auth, payment, crawler policy, MCP mutation, business claims and brand positioning approval-gated.",
      "Return completed artifacts, then rerender and strict-lint the report."
    ]
  };
}

export function buildPendingAgentReview(bundle: ReportBundle): AgentReview {
  const evidence = sourceLink(
    "agent-review-input.json",
    "Review packet generated and awaiting agent review."
  );
  return {
    generatedAt: new Date().toISOString(),
    status: "pending",
    reviewer: "pending",
    targetUrl: bundle.scan.config.url,
    sourceArtifacts: SOURCE_ARTIFACTS,
    executiveSummary:
      "Pending agent review. A repo-capable agent must complete agent-review.json before production readiness can pass.",
    finalAudit: {
      status: "pending",
      executiveSummary:
        "Pending agent review. Complete the review artifacts before treating this audit as production-ready.",
      finalAuditMarkdown:
        "# Final Audit\n\nPending agent review. Complete `agent-review.json`, rerender the report, and run strict lint.",
      topPriorities: [],
      evidence: [evidence]
    },
    searchIntent: {
      status: "pending",
      summary: "Pending agent search-intent and topical-coverage review.",
      primaryIntent: "pending_agent_review",
      secondaryIntents: [],
      contentGaps: [],
      evidence: [evidence]
    },
    agentSkills: {
      status: "pending",
      summary: "Pending review of whether AI agents can understand, navigate and safely act on the site.",
      taskSimulations: [],
      blockers: ["Complete agent-authored review artifacts."],
      evidence: [evidence]
    },
    strategicFindings: [],
    copyRecommendations: [],
    limitations: ["Agent review artifacts have not been completed yet."]
  };
}

export function buildFixtureAgentReview(bundle: ReportBundle, dashboard: ReportDashboard): AgentReview {
  const counts = countBySeverity(bundle.findings);
  const topFinding = groupFindings(bundle.findings)[0];
  const baseEvidence = firstEvidenceLink(bundle);
  const queueEvidence = sourceLink(
    "report-dashboard.json",
    "Fixture review cites the deterministic dashboard queues."
  );
  const topPriorities =
    dashboard.nextBestFixes.length > 0
      ? dashboard.nextBestFixes.slice(0, 3).map((item) => `${item.findingId}: ${item.title}`)
      : topFinding
        ? [`${topFinding.id}: ${topFinding.title}`]
        : ["No open deterministic findings."];
  const executiveSummary = [
    `Fixture agent review completed for ${bundle.scan.config.url}.`,
    `The deterministic scan scored ${bundle.score.total}/100 with ${counts.critical} critical, ${counts.high} high and ${counts.medium} medium findings.`,
    `Primary execution focus: ${topPriorities[0]}.`
  ].join(" ");

  return {
    generatedAt: new Date().toISOString(),
    status: "complete",
    reviewer: "fixture",
    targetUrl: bundle.scan.config.url,
    sourceArtifacts: SOURCE_ARTIFACTS,
    executiveSummary,
    finalAudit: {
      status: "complete",
      executiveSummary,
      finalAuditMarkdown: `# Final Audit\n\n${executiveSummary}\n\nTop priorities:\n${topPriorities
        .map((item) => `- ${item}`)
        .join("\n")}\n`,
      topPriorities,
      evidence: [baseEvidence, queueEvidence]
    },
    searchIntent: {
      status: "complete",
      summary:
        "Fixture review preserves deterministic search-intent evidence and marks detailed copy judgment as agent-owned.",
      primaryIntent: "Review target page intent against evidence-backed findings.",
      secondaryIntents: dashboard.templateHeatmap.slice(0, 3).map((item) => item.template),
      contentGaps: topFinding ? [topFinding.recommendation] : [],
      evidence: [baseEvidence, sourceLink("findings.json", "Findings supply intent and content signals.")]
    },
    agentSkills: {
      status: "complete",
      summary:
        "Fixture review checks agent-readiness from discovery, structured data, policy and implementation queue artifacts.",
      taskSimulations: [
        {
          task: "Find the highest-priority safe implementation item.",
          outcome: dashboard.nextBestFixes.length > 0 ? "pass" : "partial",
          evidence: [queueEvidence],
          recommendation:
            dashboard.nextBestFixes.length > 0
              ? "Use the next-best-fixes queue before lower-impact work."
              : "Complete manual or approval-gated decisions before expecting a safe implementation queue."
        }
      ],
      blockers: dashboard.approvalQueue.length > 0 ? ["Approval-gated queue items remain."] : [],
      evidence: [
        queueEvidence,
        sourceLink("agent-execution-plan.md", "Agent handoff plan mirrors the queue.")
      ]
    },
    strategicFindings: topFinding
      ? [
          {
            id: `agent-${topFinding.id.toLowerCase()}`,
            title: `Agent review priority: ${topFinding.title}`,
            summary: topFinding.impact,
            severity: topFinding.severity,
            category: topFinding.category,
            evidence: [baseEvidence],
            recommendation: topFinding.recommendation,
            approvalState:
              topFinding.approvalRequired ||
              requiresApprovalForText(
                [
                  topFinding.title,
                  topFinding.impact,
                  topFinding.rootCause,
                  topFinding.recommendation,
                  ...topFinding.validation
                ].join("\n")
              )
                ? "approval_required"
                : "not_required",
            validation:
              topFinding.validation.length > 0
                ? topFinding.validation
                : ["seo-polish report lint <report-dir> --strict"]
          }
        ]
      : [],
    copyRecommendations: buildFixtureCopyRecommendations(bundle),
    limitations: [
      "Fixture review is deterministic test output, not a substitute for a human/agent-authored production review."
    ]
  };
}

export async function writeAgentReviewArtifacts(
  outputDir: string,
  input: AgentReviewInput,
  review: AgentReview
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "agent-review-input.json"), `${JSON.stringify(input, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "agent-review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await writeFile(
    join(outputDir, "search-intent-review.json"),
    `${JSON.stringify(review.searchIntent, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "agent-skills-review.json"),
    `${JSON.stringify(review.agentSkills, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "copy-recommendations.json"),
    `${JSON.stringify(review.copyRecommendations, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "copy-recommendations.md"),
    renderCopyRecommendationsMarkdown(review),
    "utf8"
  );
  await writeFile(join(outputDir, "final-audit.md"), renderFinalAuditMarkdown(review), "utf8");
}

export function renderCopyRecommendationsMarkdown(review: AgentReview): string {
  const lines = ["# Copy Recommendations", "", `Status: ${review.status}`, ""];
  if (review.copyRecommendations.length === 0) {
    lines.push("No copy recommendations are currently proposed.");
    return `${lines.join("\n")}\n`;
  }
  for (const item of review.copyRecommendations) {
    lines.push(`## ${item.id}`, "");
    lines.push(`Target: ${item.target}`);
    lines.push(`Approval: ${item.approvalState}`);
    lines.push(`Safe to apply: ${item.safeToApply ? "yes" : "no"}`);
    lines.push(`Affected URLs: ${item.affectedUrls.join(", ") || "N/A"}`, "");
    if (item.current) {
      lines.push("Current:", "", item.current, "");
    }
    lines.push("Proposed:", "", item.proposed, "", "Rationale:", "", item.rationale, "");
  }
  return `${lines.join("\n")}\n`;
}

export function renderFinalAuditMarkdown(review: AgentReview): string {
  if (review.status !== "complete") {
    return `${review.finalAudit.finalAuditMarkdown.trim()}\n`;
  }
  return `${review.finalAudit.finalAuditMarkdown.trim()}\n`;
}

function buildFixtureCopyRecommendations(bundle: ReportBundle): AgentCopyRecommendation[] {
  const contentFinding = bundle.findings.find((finding) =>
    ["onpage_seo", "content_seo", "media_seo"].includes(finding.category)
  );
  if (!contentFinding) {
    return [];
  }
  return [
    {
      id: `copy-${contentFinding.id.toLowerCase()}`,
      target: contentFinding.category === "media_seo" ? "alt_text" : "content_brief",
      current: null,
      proposed: contentFinding.recommendation,
      rationale: "Fixture copy recommendation mirrors an evidence-backed deterministic recommendation.",
      affectedUrls: contentFinding.affectedUrls.slice(0, 8),
      evidence: [firstEvidenceLink(bundle, contentFinding.id)],
      approvalState:
        contentFinding.approvalRequired ||
        requiresApprovalForText(
          [
            contentFinding.title,
            contentFinding.impact,
            contentFinding.rootCause,
            contentFinding.recommendation,
            ...contentFinding.validation
          ].join("\n")
        )
          ? "approval_required"
          : "not_required",
      safeToApply:
        contentFinding.safeToAutoFix &&
        !contentFinding.approvalRequired &&
        !requiresApprovalForText(
          [
            contentFinding.title,
            contentFinding.impact,
            contentFinding.rootCause,
            contentFinding.recommendation,
            ...contentFinding.validation
          ].join("\n")
        )
    }
  ];
}

function firstEvidenceLink(bundle: ReportBundle, findingId?: string): AgentReviewEvidenceLink {
  const finding = findingId
    ? bundle.findings.find((item) => item.id === findingId)
    : bundle.findings.find((item) => item.evidence.length > 0);
  const evidence = finding?.evidence[0] ?? bundle.scan.evidence[0];
  if (evidence) {
    const link: AgentReviewEvidenceLink = {
      evidenceId: evidence.id,
      note: "Representative deterministic evidence from the scan."
    };
    if (finding?.id) link.findingId = finding.id;
    const url = evidence.url ?? finding?.affectedUrls[0];
    if (url) link.url = url;
    return link;
  }
  return sourceLink(
    "scan-result.json",
    "No finding-level evidence exists; scan-result.json is the source artifact."
  );
}

function sourceLink(sourceArtifact: string, note: string): AgentReviewEvidenceLink {
  return { sourceArtifact, note };
}

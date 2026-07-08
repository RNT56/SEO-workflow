import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentReview, ReportBundle, WorkflowRetrospective } from "@seo-polish/schemas";
import {
  buildAgentReviewInput,
  buildPendingAgentReview,
  writeAgentReviewArtifacts,
  type AgentReviewArtifactOptions
} from "./agentReview.js";
import type { AgentExecutionPlanOptions } from "./renderAgentExecutionPlan.js";
import { renderAgentExecutionPlan } from "./renderAgentExecutionPlan.js";
import type { ReportDashboardOptions } from "./buildReportDashboard.js";
import { buildReportDashboard } from "./buildReportDashboard.js";
import {
  buildPendingWorkflowRetrospective,
  buildWorkflowRetrospectiveInput,
  writeWorkflowRetrospectiveArtifacts,
  type WorkflowRetrospectiveArtifactOptions
} from "./workflowRetrospective.js";
import {
  renderAgentInstructionIndex,
  renderAgentInstruction,
  renderExecutiveSummary,
  renderGitHubPrComment,
  renderMarkdownReport
} from "./renderMarkdownReport.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { findingInstanceCounts, formatInstanceSuffix, uniqueRemediationOptions } from "./reportSignal.js";

export interface ReportBundleWriteOptions
  extends
    AgentExecutionPlanOptions,
    ReportDashboardOptions,
    AgentReviewArtifactOptions,
    WorkflowRetrospectiveArtifactOptions {}

export async function writeReportBundle(
  outputDir: string,
  bundle: ReportBundle,
  options: ReportBundleWriteOptions = {}
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "agent-instructions"), { recursive: true });

  const agentReview =
    options.agentReview ?? (await readExistingAgentReview(outputDir)) ?? buildPendingAgentReview(bundle);
  const dashboard = buildReportDashboard(bundle, { ...options, agentReview });
  const agentReviewInput = buildAgentReviewInput(bundle, dashboard);
  await writeAgentReviewArtifacts(outputDir, agentReviewInput, agentReview);
  const workflowRetrospective =
    options.workflowRetrospective ??
    (await readExistingWorkflowRetrospective(outputDir)) ??
    buildPendingWorkflowRetrospective(bundle);
  const workflowRetrospectiveInput = buildWorkflowRetrospectiveInput(bundle, dashboard, agentReview);
  await writeWorkflowRetrospectiveArtifacts(
    outputDir,
    workflowRetrospectiveInput,
    workflowRetrospective,
    agentReview.status === "complete" && bundle.validation.ok
  );

  await writeFile(join(outputDir, "index.md"), renderMarkdownReport(bundle, { agentReview }), "utf8");
  await writeFile(
    join(outputDir, "index.html"),
    renderHtmlReport(bundle, { dashboard, agentReview }),
    "utf8"
  );
  await writeFile(join(outputDir, "findings.json"), `${JSON.stringify(bundle.findings, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "score.json"), `${JSON.stringify(bundle.score, null, 2)}\n`, "utf8");
  await writeFile(
    join(outputDir, "report-dashboard.json"),
    `${JSON.stringify(dashboard, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "remediation-plan.json"),
    `${JSON.stringify(bundle.remediationPlan, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "validation.json"),
    `${JSON.stringify(bundle.validation, null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(outputDir, "patch.diff"), bundle.patchDiff, "utf8");
  await writeFile(
    join(outputDir, "executive-summary.md"),
    renderExecutiveSummary(bundle, { agentReview }),
    "utf8"
  );
  await writeFile(join(outputDir, "priority-action-plan.md"), renderPriorityActionPlan(bundle), "utf8");
  await writeFile(
    join(outputDir, "agent-execution-plan.md"),
    renderAgentExecutionPlan(bundle, { ...options, dashboard, agentReview, workflowRetrospective }),
    "utf8"
  );
  await writeFile(join(outputDir, "github-pr-comment.md"), renderGitHubPrComment(bundle), "utf8");
  await writeFile(join(outputDir, "agent-instructions", "README.md"), renderAgentInstructionIndex(), "utf8");

  for (const agent of ["codex", "claude-code", "gemini-cli", "openclaw", "hermes"]) {
    await writeFile(
      join(outputDir, "agent-instructions", `${agent}.md`),
      renderAgentInstruction(agent, bundle),
      "utf8"
    );
  }
}

async function readExistingAgentReview(outputDir: string): Promise<AgentReview | null> {
  try {
    const review = JSON.parse(await readFile(join(outputDir, "agent-review.json"), "utf8")) as AgentReview;
    return review.status === "complete" || review.status === "invalid" ? review : null;
  } catch {
    return null;
  }
}

async function readExistingWorkflowRetrospective(outputDir: string): Promise<WorkflowRetrospective | null> {
  try {
    const retrospective = JSON.parse(
      await readFile(join(outputDir, "workflow-retrospective.json"), "utf8")
    ) as WorkflowRetrospective;
    return retrospective.status === "complete" || retrospective.status === "invalid" ? retrospective : null;
  } catch {
    return null;
  }
}

function renderPriorityActionPlan(bundle: ReportBundle): string {
  const lines = ["# Priority Action Plan", "", `Target: ${bundle.scan.config.url}`, ""];
  const instanceCounts = findingInstanceCounts(bundle.findings);
  for (const phase of bundle.remediationPlan.phases) {
    lines.push(`## ${phase.title}`, phase.summary, "");
    const items = uniqueRemediationOptions(phase.items);
    if (items.length === 0) {
      lines.push("No items.", "");
      continue;
    }
    for (const item of items) {
      lines.push(
        `- ${item.findingId}: ${item.title}${formatInstanceSuffix(instanceCounts.get(item.findingId))}`
      );
      lines.push(`  - Class: ${item.fixClass}`);
      lines.push(`  - Risk: ${item.risk}`);
      lines.push(`  - Effort: ${item.effort}`);
      lines.push(`  - Validation: ${item.validation.join("; ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

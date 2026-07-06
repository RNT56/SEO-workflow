import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportBundle } from "@seo-polish/schemas";
import type { AgentExecutionPlanOptions } from "./renderAgentExecutionPlan.js";
import { renderAgentExecutionPlan } from "./renderAgentExecutionPlan.js";
import type { ReportDashboardOptions } from "./buildReportDashboard.js";
import { buildReportDashboard } from "./buildReportDashboard.js";
import {
  renderAgentInstructionIndex,
  renderAgentInstruction,
  renderExecutiveSummary,
  renderGitHubPrComment,
  renderMarkdownReport
} from "./renderMarkdownReport.js";
import { renderHtmlReport } from "./renderHtmlReport.js";
import { findingInstanceCounts, formatInstanceSuffix, uniqueRemediationOptions } from "./reportSignal.js";

export interface ReportBundleWriteOptions extends AgentExecutionPlanOptions, ReportDashboardOptions {}

export async function writeReportBundle(
  outputDir: string,
  bundle: ReportBundle,
  options: ReportBundleWriteOptions = {}
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "agent-instructions"), { recursive: true });

  const dashboard = buildReportDashboard(bundle, options);
  await writeFile(join(outputDir, "index.md"), renderMarkdownReport(bundle), "utf8");
  await writeFile(join(outputDir, "index.html"), renderHtmlReport(bundle, { dashboard }), "utf8");
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
  await writeFile(join(outputDir, "executive-summary.md"), renderExecutiveSummary(bundle), "utf8");
  await writeFile(join(outputDir, "priority-action-plan.md"), renderPriorityActionPlan(bundle), "utf8");
  await writeFile(
    join(outputDir, "agent-execution-plan.md"),
    renderAgentExecutionPlan(bundle, { ...options, dashboard }),
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

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportBundle } from "@seo-polish/schemas";
import {
  renderAgentInstructionIndex,
  renderAgentInstruction,
  renderExecutiveSummary,
  renderGitHubPrComment,
  renderMarkdownReport
} from "./renderMarkdownReport.js";
import { renderHtmlReport } from "./renderHtmlReport.js";

export async function writeReportBundle(outputDir: string, bundle: ReportBundle): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "agent-instructions"), { recursive: true });

  await writeFile(join(outputDir, "index.md"), renderMarkdownReport(bundle), "utf8");
  await writeFile(join(outputDir, "index.html"), renderHtmlReport(bundle), "utf8");
  await writeFile(join(outputDir, "findings.json"), `${JSON.stringify(bundle.findings, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "score.json"), `${JSON.stringify(bundle.score, null, 2)}\n`, "utf8");
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
  for (const phase of bundle.remediationPlan.phases) {
    lines.push(`## ${phase.title}`, phase.summary, "");
    if (phase.items.length === 0) {
      lines.push("No items.", "");
      continue;
    }
    for (const item of phase.items) {
      lines.push(`- ${item.findingId}: ${item.title}`);
      lines.push(`  - Class: ${item.fixClass}`);
      lines.push(`  - Risk: ${item.risk}`);
      lines.push(`  - Effort: ${item.effort}`);
      lines.push(`  - Validation: ${item.validation.join("; ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

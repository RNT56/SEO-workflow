import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportBundle } from "@seo-polish/schemas";
import {
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
  await writeFile(join(outputDir, "github-pr-comment.md"), renderGitHubPrComment(bundle), "utf8");

  for (const agent of ["codex", "claude-code", "gemini-cli", "openclaw", "hermes"]) {
    await writeFile(
      join(outputDir, "agent-instructions", `${agent}.md`),
      renderAgentInstruction(agent),
      "utf8"
    );
  }
}

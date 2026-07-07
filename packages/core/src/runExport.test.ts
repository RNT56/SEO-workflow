import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExport } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("runExport", () => {
  it("creates a redacted review export directory with manifest and checksums", async () => {
    const reportDir = await fixtureReport();
    const summary = await runExport({ reportDir, profile: "review", format: "directory" });

    expect(summary.profile).toBe("review");
    expect(summary.format).toBe("directory");
    expect(summary.localPathsRedacted).toBe(true);
    expect(summary.files).toBeGreaterThan(3);

    const html = await readFile(join(summary.outputPath, "index.html"), "utf8");
    expect(html).toContain("[redacted-local-path]");
    expect(html).not.toContain("/Users/");

    const manifest = JSON.parse(await readFile(join(summary.outputPath, "export-manifest.json"), "utf8"));
    expect(manifest.profile).toBe("review");
    expect(manifest.privacy.localPathsRedacted).toBe(true);

    const checksums = await readFile(join(summary.outputPath, "checksums.sha256"), "utf8");
    expect(checksums).toContain("index.html");
    expect(checksums).toContain("export-manifest.json");
  });

  it("creates a zip export for repo import packages", async () => {
    const reportDir = await fixtureReport();
    const outputPath = join(reportDir, "repo-import.zip");
    const summary = await runExport({
      reportDir,
      profile: "repo-import",
      format: "zip",
      outputPath
    });

    const archive = await readFile(summary.outputPath);
    expect(summary.outputPath).toBe(outputPath);
    expect(archive.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    expect(archive.includes(Buffer.from("export-manifest.json"))).toBe(true);
  });
});

async function fixtureReport(): Promise<string> {
  const reportDir = await mkdtemp(join(tmpdir(), "seo-polish-export-report-"));
  tempDirs.push(reportDir);
  const scan = {
    scanId: "scan_test",
    startedAt: "2026-07-07T00:00:00.000Z",
    completedAt: "2026-07-07T00:00:01.000Z",
    config: {
      url: "https://example.com",
      outputDir: reportDir,
      auditRoot: "audit-reports",
      auditSlug: "example-com",
      auditRunId: "2026-07-07T000000Z-scan_test"
    }
  };
  await writeFile(join(reportDir, "scan-result.json"), `${JSON.stringify(scan, null, 2)}\n`);
  await writeFile(join(reportDir, "index.html"), "<p>/Users/mt/private/site/file.ts</p>\n");
  await writeFile(join(reportDir, "index.md"), "# Report\n");
  await writeFile(join(reportDir, "findings.json"), "[]\n");
  await writeFile(join(reportDir, "score.json"), '{"total":100}\n');
  await writeFile(join(reportDir, "report-dashboard.json"), "{}\n");
  await writeFile(join(reportDir, "agent-execution-plan.md"), "# Plan\n");
  await writeFile(join(reportDir, "remediation-plan.json"), "{}\n");
  await writeFile(join(reportDir, "actionability.json"), "{}\n");
  await writeFile(join(reportDir, "validation.json"), "{}\n");
  await writeFile(join(reportDir, "quality-gate.json"), "{}\n");
  await writeFile(join(reportDir, "patch.diff"), "");
  await writeFile(join(reportDir, "repo-analysis.json"), '{"path":"/Users/mt/private/site"}\n');
  await writeFile(join(reportDir, "audit-run.json"), "{}\n");
  return reportDir;
}

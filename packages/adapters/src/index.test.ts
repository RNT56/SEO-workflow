import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyChangeSet, detectAdapter, planChangeSet } from "./index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("framework adapters", () => {
  it("plans bounded static changes and enforces approvals and hashes", async () => {
    const root = await temporaryDirectory();
    const repoPath = join(root, "site");
    const reportDir = join(root, "report");
    await import("node:fs/promises").then(({ mkdir }) =>
      Promise.all([mkdir(repoPath, { recursive: true }), mkdir(reportDir, { recursive: true })])
    );
    await writeFile(
      join(repoPath, "index.html"),
      '<!doctype html><html lang="en"><head><title>Fixture</title></head><body>Fixture</body></html>',
      "utf8"
    );
    await writeFile(
      join(reportDir, "scan-result.json"),
      `${JSON.stringify({ config: { url: "https://example.com" } })}\n`
    );
    await writeFile(
      join(reportDir, "findings.json"),
      `${JSON.stringify([finding("SEO-CRAWL-001"), finding("SEO-ONPAGE-011")])}\n`
    );
    await writeFile(
      join(reportDir, "remediation-plan.json"),
      `${JSON.stringify({
        safeFixes: [{ findingId: "SEO-CRAWL-001" }, { findingId: "SEO-ONPAGE-011" }],
        approvalRequired: [],
        manualRecommendations: [],
        phases: [],
        userDecisions: []
      })}\n`
    );

    expect(await detectAdapter(repoPath)).toBe("static-html");
    const changeSet = await planChangeSet({ reportDir, repoPath });
    const robots = changeSet.changes.find((change) => change.findingId === "SEO-CRAWL-001");
    const viewport = changeSet.changes.find((change) => change.findingId === "SEO-ONPAGE-011");
    expect(robots?.approvalRequired).toBe(true);
    expect(viewport?.approvalRequired).toBe(false);

    const partial = await applyChangeSet({ changeSet });
    expect(partial.status).toBe("partially_applied");
    expect(await readFile(join(repoPath, "index.html"), "utf8")).toContain('name="viewport"');
    await expect(readFile(join(repoPath, "robots.txt"), "utf8")).rejects.toThrow();

    const approved = await planChangeSet({ reportDir, repoPath });
    const approvedRobots = approved.changes.find((change) => change.findingId === "SEO-CRAWL-001");
    expect(approvedRobots).toBeTruthy();
    const applied = await applyChangeSet({ changeSet: approved, approvedChangeIds: [approvedRobots!.id] });
    expect(applied.status).toBe("applied");
    expect(await readFile(join(repoPath, "robots.txt"), "utf8")).toContain(
      "Sitemap: https://example.com/sitemap.xml"
    );
  });
});

function finding(id: string): Record<string, unknown> {
  return {
    id,
    title: id,
    category: "technical_seo",
    severity: "medium",
    confidence: 100,
    status: "open",
    impact: "Impact",
    rootCause: "Cause",
    evidence: [{ id: `evidence-${id}`, type: "file", timestamp: "2026-07-09T00:00:00.000Z" }],
    affectedUrls: ["https://example.com"],
    affectedTemplates: [],
    recommendation: "Fix",
    remediation: [],
    safeToAutoFix: true,
    approvalRequired: false,
    validation: ["verify"]
  };
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "seo-polish-adapter-"));
  temporaryDirectories.push(path);
  return path;
}

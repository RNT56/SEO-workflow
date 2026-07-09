import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startControlCenter, type RunningControlCenter } from "./controlCenter.js";

const temporaryDirectories: string[] = [];
const servers: RunningControlCenter[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local control center", () => {
  it("refuses non-loopback binding", async () => {
    await expect(
      startControlCenter({ auditRoot: ".", host: "0.0.0.0", port: 0, openBrowser: false })
    ).rejects.toThrow("loopback");
  });

  it("serves portfolio, run and report state without cloud dependencies", async () => {
    const root = await temporaryDirectory();
    const reportDir = join(root, "example", "run-1");
    await mkdir(reportDir, { recursive: true });
    const auditRun = {
      targetUrl: "https://example.com",
      reportPath: reportDir,
      completedAt: "2026-07-09T00:00:00.000Z",
      score: 92,
      qualityGateStatus: "passed"
    };
    await writeFile(join(root, "audit-index.json"), `${JSON.stringify({ runs: [auditRun] })}\n`, "utf8");
    await writeFile(join(reportDir, "audit-run.json"), `${JSON.stringify(auditRun)}\n`, "utf8");
    await writeFile(
      join(reportDir, "score.json"),
      `${JSON.stringify({ total: 92, experimentalCombined: 88, level: "excellent", coverage: { percentMeasured: 95 } })}\n`,
      "utf8"
    );
    await writeFile(join(reportDir, "findings.json"), "[]\n", "utf8");
    await writeFile(
      join(reportDir, "workflow-state.json"),
      `${JSON.stringify({ status: "complete", mode: "quick-audit" })}\n`,
      "utf8"
    );

    const controlCenter = await startControlCenter({ auditRoot: root, port: 0, openBrowser: false });
    servers.push(controlCenter);

    const page = await fetch(controlCenter.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("SEO Polish Control Center");

    const portfolio = (await fetch(`${controlCenter.url}/api/portfolio`).then((response) =>
      response.json()
    )) as {
      totals: { targets: number };
    };
    expect(portfolio.totals.targets).toBe(1);

    const runs = (await fetch(`${controlCenter.url}/api/runs`).then((response) => response.json())) as {
      runs: Array<{ workflowStatus?: string; workflowMode?: string }>;
    };
    expect(runs.runs[0]).toMatchObject({ workflowStatus: "complete", workflowMode: "quick-audit" });

    const crossOriginDecision = await fetch(`${controlCenter.url}/api/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ reportDir, decisionId: "anything", status: "approved" })
    });
    expect(crossOriginDecision.status).toBe(500);
    await expect(crossOriginDecision.json()).resolves.toMatchObject({
      error: "Control center changes require a same-origin request."
    });

    const report = (await fetch(`${controlCenter.url}/api/report?path=${encodeURIComponent(reportDir)}`).then(
      (response) => response.json()
    )) as { score: { total: number } };
    expect(report.score.total).toBe(92);
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "seo-polish-control-center-"));
  temporaryDirectories.push(path);
  return path;
}

import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFixtureAgentReview,
  buildFixtureWorkflowRetrospective,
  buildReportDashboard
} from "@seo-polish/reporters";
import type { ReportBundle, ReportDashboard } from "@seo-polish/schemas";
import {
  buildPortfolio,
  compareReports,
  importAgentReview,
  importWorkflowRetrospective,
  initProject,
  readWorkflowState,
  recordDecision,
  resumeWorkflow,
  runWorkflow,
  WORKFLOW_EVENTS_FILE,
  WORKFLOW_STATE_FILE
} from "./index.js";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("guided workflow", () => {
  it("initializes, runs, verifies and records a resumable quick audit", async () => {
    const root = await temporaryDirectory();
    const targetUrl = await fixtureSite();
    const workspacePath = join(root, "seo-polish.workspace.json");
    const auditRoot = join(root, "audits");
    const project = await initProject({
      workspacePath,
      auditRoot,
      name: "Workflow fixture",
      url: targetUrl,
      mode: "quick-audit"
    });

    const state = await runWorkflow({ workspacePath, maxPages: 1 });

    expect(state.projectId).toBe(project.projectId);
    expect(state.status).toBe("complete");
    expect(state.currentPhase).toBe("complete");
    expect(state.reportDir).toBeTruthy();
    expect(state.phases.find((phase) => phase.id === "review")?.status).toBe("skipped");
    expect(state.phases.find((phase) => phase.id === "verify")?.status).toBe("complete");
    expect(await readFile(join(state.reportDir!, WORKFLOW_STATE_FILE), "utf8")).toContain(state.workflowId);
    expect(await readFile(join(state.reportDir!, WORKFLOW_EVENTS_FILE), "utf8")).toContain("phase_completed");

    const comparison = await compareReports(state.reportDir!, state.reportDir!);
    expect(comparison.regressionGate).toBe("passed");
    expect(comparison.scoreDelta).toBe(0);

    const portfolio = await buildPortfolio(auditRoot);
    expect(portfolio.totals.targets).toBe(1);
    expect(portfolio.totals.runs).toBe(1);
  });

  it("completes review, decisions, bounded application, fresh verification and retrospective", async () => {
    const root = await temporaryDirectory();
    const repoPath = join(root, "site");
    await mkdir(repoPath, { recursive: true });
    await writeFile(
      join(repoPath, "index.html"),
      '<!doctype html><html lang="en"><head><title>Full workflow fixture</title></head><body>Fixture</body></html>',
      "utf8"
    );
    const targetUrl = await fixtureSite();
    const workspacePath = join(root, "seo-polish.workspace.json");
    await initProject({
      workspacePath,
      auditRoot: join(root, "audits"),
      name: "Full workflow fixture",
      url: targetUrl,
      repoPath,
      mode: "full-remediation"
    });

    let state = await runWorkflow({ workspacePath, maxPages: 1 });
    const statePath = state.reportDir!;
    expect(state.status).toBe("awaiting_approval");
    expect(state.currentPhase).toBe("review");

    await writeFixtureReview(state.reportDir!, join(root, "agent-review.json"));
    await importAgentReview(statePath, join(root, "agent-review.json"));
    state = await readWorkflowState(statePath);
    for (const decision of state.decisions.filter((item) => item.status === "pending")) {
      await recordDecision({
        statePath,
        decisionId: decision.id,
        status: decision.id === "finding-seo-onpage-011" ? "approved" : "deferred",
        decidedBy: "test-owner"
      });
    }

    state = await resumeWorkflow({ statePath, applySafe: true, verificationUrl: targetUrl });
    expect(state.status).toBe("awaiting_approval");
    expect(state.stopReasons).toContain("final verification report review incomplete");
    expect(await readFile(join(repoPath, "index.html"), "utf8")).toContain('name="viewport"');

    await writeFixtureReview(state.reportDir!, join(root, "final-agent-review.json"));
    await importAgentReview(statePath, join(root, "final-agent-review.json"));
    state = await resumeWorkflow({ statePath });
    expect(state.stopReasons).toContain("workflow retrospective incomplete");

    await writeFixtureRetrospective(state.reportDir!, join(root, "workflow-retrospective.json"));
    await importWorkflowRetrospective(statePath, join(root, "workflow-retrospective.json"));
    state = await resumeWorkflow({ statePath });

    expect(state.status).toBe("complete");
    expect(state.phases.find((phase) => phase.id === "retrospective")?.status).toBe("complete");
  });
});

async function fixtureSite(): Promise<string> {
  const server = createServer((request, response) => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unexpected fixture server address.");
    const origin = `http://127.0.0.1:${address.port}`;
    if (request.url === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
      return;
    }
    if (request.url === "/sitemap.xml") {
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(`<urlset><url><loc>${origin}/</loc></url></urlset>`);
      return;
    }
    if (request.url === "/llms.txt") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`# Fixture\n- [Home](${origin}/)\n`);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<!doctype html><html lang="en"><head><title>Guided workflow fixture</title><meta name="description" content="A deterministic workflow fixture page."><link rel="canonical" href="${origin}/"></head><body><a href="#main">Skip</a><main id="main"><h1>Guided workflow fixture</h1><p>This complete fixture contains enough useful text for deterministic evidence collection, workflow verification, portfolio aggregation and baseline comparison.</p></main></body></html>`
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected fixture server address.");
  return `http://127.0.0.1:${address.port}/`;
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "seo-polish-workflow-"));
  temporaryDirectories.push(path);
  return path;
}

async function reportBundle(reportDir: string): Promise<ReportBundle> {
  return {
    scan: JSON.parse(await readFile(join(reportDir, "scan-result.json"), "utf8")),
    findings: JSON.parse(await readFile(join(reportDir, "findings.json"), "utf8")),
    score: JSON.parse(await readFile(join(reportDir, "score.json"), "utf8")),
    remediationPlan: JSON.parse(await readFile(join(reportDir, "remediation-plan.json"), "utf8")),
    validation: JSON.parse(await readFile(join(reportDir, "validation.json"), "utf8")),
    patchDiff: await readFile(join(reportDir, "patch.diff"), "utf8")
  };
}

async function writeFixtureReview(reportDir: string, outputPath: string): Promise<void> {
  const bundle = await reportBundle(reportDir);
  const dashboard = buildReportDashboard(bundle);
  await writeFile(
    outputPath,
    `${JSON.stringify(buildFixtureAgentReview(bundle, dashboard), null, 2)}\n`,
    "utf8"
  );
}

async function writeFixtureRetrospective(reportDir: string, outputPath: string): Promise<void> {
  const bundle = await reportBundle(reportDir);
  const dashboard = JSON.parse(
    await readFile(join(reportDir, "report-dashboard.json"), "utf8")
  ) as ReportDashboard;
  const review = JSON.parse(await readFile(join(reportDir, "agent-review.json"), "utf8"));
  await writeFile(
    outputPath,
    `${JSON.stringify(buildFixtureWorkflowRetrospective(bundle, dashboard, review), null, 2)}\n`,
    "utf8"
  );
}

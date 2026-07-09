import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAction, type ActionInputs } from "./index.js";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  process.exitCode = 0;
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("GitHub regression action", () => {
  it("compares a current scan to a baseline and exposes a stable regression gate", async () => {
    const root = await temporaryDirectory();
    const url = await fixtureSite();
    const baseline = join(root, "baseline");
    const current = join(root, "current");
    const baseInputs: ActionInputs = {
      url,
      outputDir: baseline,
      maxPages: 1,
      browserEvidence: false,
      maxScoreDrop: 0,
      failOnNewHigh: true,
      failOnCritical: false,
      failOnReportLint: false,
      failOnPrivateUrl: true
    };
    await runAction(baseInputs);
    const result = await runAction({ ...baseInputs, outputDir: current, baselinePath: baseline });

    expect(result.regressionGate).toBe("passed");
    expect(result.scoreDelta).toBe(0);
    expect(result.failedReasons).toEqual([]);
  });
});

async function fixtureSite(): Promise<string> {
  const server = createServer((request, response) => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unexpected address.");
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
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<!doctype html><html lang="en"><head><title>Action fixture</title><meta name="description" content="A stable action fixture."><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="${origin}/"></head><body><a href="#main">Skip</a><main id="main"><h1>Action fixture</h1><p>This page is stable enough for deterministic baseline and current regression scan comparison.</p></main></body></html>`
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected address.");
  return `http://127.0.0.1:${address.port}/`;
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "seo-polish-action-"));
  temporaryDirectories.push(path);
  return path;
}

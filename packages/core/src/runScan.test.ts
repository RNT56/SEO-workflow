import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runScan } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("runScan", () => {
  it("generates a lintable report", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:0/sitemap.xml\n");
        return;
      }
      if (req.url === "/sitemap.xml") {
        res.writeHead(200, { "content-type": "application/xml" });
        res.end("<urlset><url><loc>http://127.0.0.1/</loc></url></urlset>");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        '<!doctype html><html lang="en"><head><title>Complete Example Page</title><meta name="description" content="A useful fixture page for SEO polish."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"></head><body><a href="#main">Skip</a><main id="main"><h1>Complete Example Page</h1><p>This page has enough useful text to avoid thin content in the basic fixture. It includes clear copy, a primary heading, metadata and a canonical URL.</p></main></body></html>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    const dir = await mkdtemp(join(tmpdir(), "seo-polish-report-"));
    tempDirs.push(dir);
    const summary = await runScan({
      url: `http://127.0.0.1:${address.port}/`,
      outputDir: dir,
      maxPages: 1,
      includeSearchIntegrations: false
    });
    server.close();

    expect(summary.reportPath).toBe(dir);
    expect(summary.score.total).toBeGreaterThanOrEqual(0);
  });

  it("stores default scans in a deterministic audit report folder", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        '<!doctype html><html lang="en"><head><title>Audit Folder Fixture</title><meta name="description" content="A useful page."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"></head><body><a href="#main">Skip</a><main id="main"><h1>Audit Folder Fixture</h1><p>This fixture has enough useful text to produce a complete audit output folder.</p></main></body></html>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    const auditRoot = await mkdtemp(join(tmpdir(), "seo-polish-audit-root-"));
    tempDirs.push(auditRoot);
    const summary = await runScan({
      url: `http://127.0.0.1:${address.port}/`,
      auditRoot,
      maxPages: 1,
      includeSearchIntegrations: false
    });
    server.close();

    expect(summary.reportPath.startsWith(join(auditRoot, "127-0-0-1"))).toBe(true);
    expect(basename(summary.reportPath)).toContain(summary.scanId);

    const auditRun = JSON.parse(await readFile(join(summary.reportPath, "audit-run.json"), "utf8"));
    expect(auditRun.auditOutputMode).toBe("auto");
    expect(auditRun.auditSlug).toBe("127-0-0-1");
    expect(auditRun.artifacts).toContain("index.html");

    const index = JSON.parse(await readFile(join(auditRoot, "audit-index.json"), "utf8"));
    expect(index.runs.some((run: { scanId: string }) => run.scanId === summary.scanId)).toBe(true);
  });
});

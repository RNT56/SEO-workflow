import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});

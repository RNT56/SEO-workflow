#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const fixturesDir = join(root, "fixtures", "sites");
const cliPath = join(root, "packages", "cli", "dist", "index.js");

const fixtureNames = (await readdir(fixturesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const failures = [];

for (const fixtureName of fixtureNames) {
  const fixtureDir = join(fixturesDir, fixtureName);
  const expected = JSON.parse(await readFile(join(fixtureDir, "expected-findings.json"), "utf8"));
  const server = await serveFixture(fixtureDir);
  const outputDir = await mkdtemp(join(tmpdir(), `seo-polish-${fixtureName}-`));
  try {
    const url = `http://127.0.0.1:${server.port}/`;
    await execFileAsync(process.execPath, [
      cliPath,
      "scan",
      url,
      "--output",
      outputDir,
      "--max-pages",
      "8",
      "--max-depth",
      "3"
    ]);
    await execFileAsync(process.execPath, [cliPath, "report", "lint", outputDir, "--strict"]);
    const findings = JSON.parse(await readFile(join(outputDir, "findings.json"), "utf8"));
    const actualIds = new Set(findings.map((finding) => finding.id));
    const missing = expected.filter((id) => !actualIds.has(id));
    const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
    if (missing.length > 0) {
      failures.push(`${fixtureName}: missing expected findings ${missing.join(", ")}`);
    }
    if (expected.length === 0 && criticalCount > 0) {
      failures.push(`${fixtureName}: expected clean fixture but found ${criticalCount} critical finding(s)`);
    }
    console.log(`${fixtureName}: ${findings.length} findings, expected ${expected.length} covered`);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await server.close();
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

async function serveFixture(fixtureDir) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://fixture.local").pathname);
    const filePath = join(fixtureDir, pathname === "/" ? "index.html" : pathname.slice(1));
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "public, max-age=60" });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port.");
  }
  return {
    port: address.port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

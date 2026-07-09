import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "./config/resolveConfig.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolveConfig", () => {
  it("rejects malformed configuration instead of silently ignoring it", async () => {
    const repoPath = await temporaryDirectory();
    await writeFile(join(repoPath, "seo-polish.config.json"), "{ invalid", "utf8");

    await expect(resolveConfig({ url: "https://example.com", repoPath })).rejects.toThrow(
      "Invalid JSON in seo-polish.config.json"
    );
  });

  it("rejects unsafe or nonsensical numeric bounds", async () => {
    await expect(resolveConfig({ url: "https://example.com", maxPages: 0 })).rejects.toThrow(
      "maxPages must be an integer between 1 and 10000"
    );
    await expect(resolveConfig({ url: "file:///tmp/site", maxPages: 10 })).rejects.toThrow(
      "Scan URL must use http or https"
    );
  });

  it("merges valid file configuration and input overrides deterministically", async () => {
    const repoPath = await temporaryDirectory();
    await writeFile(
      join(repoPath, "seo-polish.config.json"),
      `${JSON.stringify({ maxPages: 25, maxDepth: 2, performanceBudgets: { totalJsKb: 300 } })}\n`,
      "utf8"
    );

    const result = await resolveConfig({ url: "https://example.com", repoPath, maxPages: 40 });

    expect(result.maxPages).toBe(40);
    expect(result.maxDepth).toBe(2);
    expect(result.performanceBudgets?.totalJsKb).toBe(300);
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "seo-polish-config-"));
  temporaryDirectories.push(path);
  return path;
}

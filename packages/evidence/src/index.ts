import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evidence, ScanResult } from "@seo-polish/schemas";

export function serializeEvidenceJsonl(evidence: Evidence[]): string {
  return evidence.map((item) => JSON.stringify(item)).join("\n") + (evidence.length > 0 ? "\n" : "");
}

export async function writeEvidenceStore(outputDir: string, scan: ScanResult): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "evidence.jsonl"), serializeEvidenceJsonl(scan.evidence), "utf8");
  await writeFile(
    join(outputDir, "crawl-graph.json"),
    `${JSON.stringify(scan.crawlGraph, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "response-index.json"),
    `${JSON.stringify(
      scan.pages.map((page) => ({
        url: page.finalUrl,
        status: page.status,
        contentType: page.contentType
      })),
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "header-index.json"),
    `${JSON.stringify(
      Object.fromEntries(scan.pages.map((page) => [page.finalUrl, page.headers])),
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "body-excerpts.json"),
    `${JSON.stringify(
      Object.fromEntries(scan.pages.map((page) => [page.finalUrl, page.bodyExcerpt])),
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "raw-render-diff.json"),
    `${JSON.stringify({ status: "not_collected", pages: [] }, null, 2)}\n`,
    "utf8"
  );
}

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
    `${JSON.stringify(renderDiffSummary(scan), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "browser-evidence.json"),
    `${JSON.stringify(scan.browserEvidence ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "field-data.json"),
    `${JSON.stringify(scan.fieldData ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "crux-history.json"),
    `${JSON.stringify(scan.fieldData?.crux?.history ?? [], null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "search-console.json"),
    `${JSON.stringify(scan.fieldData?.searchConsole ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "url-inspection.json"),
    `${JSON.stringify(scan.fieldData?.searchConsole?.urlInspection ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "rum-vitals.json"),
    `${JSON.stringify(scan.fieldData?.rum ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "tech-stack.json"),
    `${JSON.stringify(scan.techStack ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "repo-analysis.json"),
    `${JSON.stringify(scan.repo ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "route-templates.json"),
    `${JSON.stringify(scan.routeTemplates ?? [], null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "performance-audit.json"),
    `${JSON.stringify(scan.performance ?? null, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "resource-timing.json"),
    `${JSON.stringify(scan.performance?.resources ?? [], null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "performance-runs.jsonl"),
    `${(scan.performance?.fetchTimings ?? []).map((item) => JSON.stringify(item)).join("\n")}${
      scan.performance?.fetchTimings?.length ? "\n" : ""
    }`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "third-party-cost.json"),
    `${JSON.stringify(thirdPartyCost(scan), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "largest-assets.json"),
    `${JSON.stringify(largestAssets(scan), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(outputDir, "critical-request-chain.json"),
    `${JSON.stringify(criticalRequestChain(scan), null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(outputDir, "crawl-graph.svg"), renderCrawlGraphSvg(scan), "utf8");
  await writeFile(
    join(outputDir, "internal-link-opportunities.json"),
    `${JSON.stringify(internalLinkOpportunities(scan), null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(outputDir, "orphan-pages.csv"), renderOrphanPagesCsv(scan), "utf8");
  await writeFile(join(outputDir, "deep-pages.csv"), renderDeepPagesCsv(scan), "utf8");
}

function thirdPartyCost(scan: ScanResult): unknown {
  const resources = scan.performance?.resources ?? [];
  const thirdParty = resources.filter((resource) => resource.thirdParty);
  return {
    status: scan.performance ? "measured" : "not_collected",
    requests: thirdParty.length,
    knownBytes: thirdParty.reduce((sum, resource) => sum + (resource.bytes ?? 0), 0),
    hosts: [...new Set(thirdParty.map((resource) => new URL(resource.url).hostname))].sort(),
    resources: thirdParty.map((resource) => ({
      url: resource.url,
      type: resource.type,
      bytes: resource.bytes ?? null,
      renderBlocking: resource.renderBlocking
    }))
  };
}

function largestAssets(scan: ScanResult): unknown[] {
  return (scan.performance?.resources ?? [])
    .filter((resource) => typeof resource.bytes === "number")
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
    .slice(0, 25)
    .map((resource) => ({
      url: resource.url,
      type: resource.type,
      bytes: resource.bytes,
      thirdParty: resource.thirdParty,
      renderBlocking: resource.renderBlocking
    }));
}

function criticalRequestChain(scan: ScanResult): unknown {
  const resources = (scan.performance?.resources ?? []).filter((resource) => resource.renderBlocking);
  return {
    status: scan.performance ? "heuristic" : "not_collected",
    limitation:
      "HTTP fallback identifies statically render-blocking scripts and stylesheets; browser initiator chains require CDP evidence.",
    resources: resources.map((resource) => ({
      url: resource.url,
      type: resource.type,
      bytes: resource.bytes ?? null,
      totalMs: resource.totalMs ?? null
    }))
  };
}

function renderDiffSummary(scan: ScanResult): unknown {
  if (scan.browserEvidence?.status === "ok") {
    return {
      status: "collected",
      mode: scan.config.renderJs,
      pages: scan.browserEvidence.pages.map((page) => {
        const raw = scan.pages.find(
          (rawPage) => rawPage.finalUrl === page.url || rawPage.finalUrl === page.finalUrl
        );
        return {
          url: page.finalUrl,
          raw: raw ? { title: raw.title, wordCount: raw.wordCount } : null,
          rendered: page.rendered,
          changedFields: page.rawComparison.changedFields,
          risk: page.rawComparison.risk
        };
      })
    };
  }
  return {
    status: scan.config.renderJs === "never" ? "disabled" : "not_collected",
    mode: scan.config.renderJs,
    pages: scan.pages.map((page) => ({
      url: page.finalUrl,
      raw: {
        title: page.title,
        metaDescription: page.metaDescription,
        canonical: page.canonical,
        h1: page.headings.find((heading) => heading.level === 1)?.text ?? null,
        wordCount: page.wordCount,
        internalLinks: page.internalLinks.length,
        jsonLdTypes: [...new Set(page.jsonLd.flatMap((item) => item.types))]
      },
      rendered: null,
      risk:
        scan.config.renderJs === "always" || (page.wordCount < 30 && page.internalLinks.length === 0)
          ? "review_recommended"
          : "low"
    }))
  };
}

function internalLinkOpportunities(scan: ScanResult): unknown[] {
  const incoming = new Map<string, number>();
  for (const edge of scan.crawlGraph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  return scan.pages
    .filter((page) => (incoming.get(page.finalUrl) ?? 0) <= 1 || page.internalLinks.length === 0)
    .map((page) => ({
      url: page.finalUrl,
      incomingLinks: incoming.get(page.finalUrl) ?? 0,
      outgoingInternalLinks: page.internalLinks.length,
      recommendation:
        page.internalLinks.length === 0
          ? "Add contextual links from this page to related canonical pages."
          : "Add more internal links from hub or navigation pages to this URL."
    }));
}

function renderOrphanPagesCsv(scan: ScanResult): string {
  const linked = new Set(scan.crawlGraph.edges.map((edge) => edge.to));
  const rows = [
    ["url", "depth", "status"],
    ...scan.crawlGraph.nodes
      .filter((node) => node.depth > 0 && !linked.has(node.url))
      .map((node) => [node.url, String(node.depth), String(node.status ?? "")])
  ];
  return rows.map(csvRow).join("\n") + "\n";
}

function renderDeepPagesCsv(scan: ScanResult): string {
  const rows = [
    ["url", "depth", "status"],
    ...scan.crawlGraph.nodes
      .filter((node) => node.depth >= 3)
      .map((node) => [node.url, String(node.depth), String(node.status ?? "")])
  ];
  return rows.map(csvRow).join("\n") + "\n";
}

function csvRow(values: string[]): string {
  return values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");
}

function renderCrawlGraphSvg(scan: ScanResult): string {
  const width = 960;
  const rowHeight = 52;
  const height = Math.max(160, 80 + scan.crawlGraph.nodes.length * rowHeight);
  const nodes = scan.crawlGraph.nodes.slice(0, 60);
  const nodeRows = nodes
    .map((node, index) => {
      const y = 52 + index * rowHeight;
      const x = 28 + Math.min(node.depth, 5) * 128;
      return `<g><circle cx="${x}" cy="${y}" r="8" fill="#38bdf8"/><text x="${x + 18}" y="${y + 5}" fill="#eef4ff" font-size="13">${escapeXml(labelForUrl(node.url))} (${node.status ?? "n/a"})</text></g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="SEO Polish crawl graph">
<rect width="100%" height="100%" fill="#0b0f14"/>
<text x="28" y="28" fill="#eef4ff" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700">Crawl graph</text>
<text x="28" y="50" fill="#9fb0c3" font-family="Inter, Arial, sans-serif" font-size="12">${scan.crawlGraph.nodes.length} nodes, ${scan.crawlGraph.edges.length} edges</text>
${nodeRows}
</svg>
`;
}

function labelForUrl(input: string): string {
  try {
    const url = new URL(input);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return input;
  }
}

function escapeXml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

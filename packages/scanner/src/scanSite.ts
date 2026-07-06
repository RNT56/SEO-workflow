import type {
  CrawlGraph,
  DiscoveryResult,
  EndpointProbe,
  Evidence,
  PageSnapshot,
  ScanConfig,
  ScanResult
} from "@seo-polish/schemas";
import { isPrivateUrl } from "@seo-polish/security";
import { classifySite, detectFramework } from "./classify.js";
import { endpointEvidence, pageEvidence } from "./evidence.js";
import { fetchUrl, probeEndpoint } from "./fetch.js";
import { extractHtmlSnapshot } from "./html.js";
import { parseRobotsTxt } from "./robots.js";
import { parseSitemapXml } from "./sitemap.js";
import { dedupeUrls, isSafePublicCrawlUrl, normalizeUrl, sameOrigin } from "./url.js";

const DISCOVERY_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/.well-known/api-catalog",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/auth.md",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/agent-card.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/ai",
  "/.well-known/ai-discovery",
  "/openapi.json",
  "/swagger.json",
  "/asyncapi.json",
  "/arazzo.yaml",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml"
];

export async function scanSite(config: ScanConfig): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const scanId = `scan_${Date.now().toString(36)}`;
  const baseUrl = normalizeUrl(config.url);
  const origin = new URL(baseUrl).origin;

  const endpoints: Record<string, EndpointProbe> = {};
  for (const path of DISCOVERY_PATHS) {
    endpoints[path] = await probeEndpoint(origin, path, config);
  }

  const robotsTxt = endpoints["/robots.txt"] ?? null;
  const sitemapXml = endpoints["/sitemap.xml"]?.ok
    ? endpoints["/sitemap.xml"]
    : endpoints["/sitemap_index.xml"]?.ok
      ? endpoints["/sitemap_index.xml"]
      : null;
  const llmsTxt = endpoints["/llms.txt"] ?? null;
  const robotsInfo = robotsTxt?.ok ? parseRobotsTxt(robotsTxt.bodyExcerpt) : null;

  const sitemapCandidates = new Set<string>();
  if (robotsInfo) {
    robotsInfo.sitemapUrls.forEach((url) => sitemapCandidates.add(url));
  }
  if (sitemapXml?.ok) {
    sitemapCandidates.add(sitemapXml.url);
  }

  const sitemapUrls: string[] = [];
  for (const sitemapUrl of sitemapCandidates) {
    if (!sameOrigin(sitemapUrl, origin)) {
      continue;
    }
    const probe = sitemapUrl === sitemapXml?.url ? sitemapXml : await probeEndpoint(sitemapUrl, "", config);
    const parsed = parseSitemapXml(probe.bodyExcerpt);
    const urls = hasSitemapIndexRoot(probe.bodyExcerpt)
      ? await collectNestedSitemapUrls(parsed.urls, origin, config)
      : parsed.urls;
    for (const url of urls) {
      try {
        const normalized = normalizeUrl(url);
        if (sameOrigin(normalized, origin)) {
          sitemapUrls.push(normalized);
        }
      } catch {
        // Malformed sitemap URL is surfaced by sitemap rules from endpoint evidence.
      }
    }
  }

  const markdownNegotiation = await probeEndpoint(baseUrl, "", config, "text/markdown, text/html;q=0.8");
  const discovery: DiscoveryResult = {
    endpoints,
    robotsTxt,
    sitemapXml,
    sitemapUrls: dedupeUrls(sitemapUrls),
    llmsTxt,
    markdownNegotiation
  };

  const pages: PageSnapshot[] = [];
  const crawlGraph: CrawlGraph = { nodes: [], edges: [] };
  const queue = dedupeUrls([baseUrl, ...discovery.sitemapUrls])
    .filter((url) => isSafePublicCrawlUrl(url, origin))
    .slice(0, Math.max(1, config.maxPages));
  const seen = new Set<string>();
  const depths = new Map<string, number>([[baseUrl, 0]]);
  const disallowAll = config.respectRobotsTxt && robotsInfo?.disallowAll === true;

  while (queue.length > 0 && pages.length < config.maxPages) {
    const url = queue.shift();
    if (!url || seen.has(url) || isPrivateUrl(url)) {
      continue;
    }
    seen.add(url);
    const depth = depths.get(url) ?? 0;
    if (depth > config.maxDepth) {
      continue;
    }
    if (disallowAll && url !== baseUrl) {
      continue;
    }

    try {
      const response = await fetchUrl(url, config, "text/html,application/xhtml+xml");
      crawlGraph.nodes.push({ url, depth, status: response.status });
      if (response.contentType.includes("text/html") || response.body.includes("<html")) {
        const page = extractHtmlSnapshot({
          url,
          finalUrl: response.finalUrl,
          status: response.status,
          contentType: response.contentType,
          headers: response.headers,
          html: response.body
        });
        pages.push(page);

        for (const link of page.internalLinks) {
          crawlGraph.edges.push({ from: page.finalUrl, to: link });
          if (!seen.has(link) && depths.size < config.maxPages * 4 && isSafePublicCrawlUrl(link, origin)) {
            depths.set(link, depth + 1);
            queue.push(link);
          }
        }
      }
    } catch {
      crawlGraph.nodes.push({ url, depth, status: null });
    }
  }

  const endpointValues = Object.values(endpoints);
  const evidence: Evidence[] = [
    ...endpointValues.map((probe, index) => endpointEvidence(probe, index)),
    ...pages.flatMap((page, index) => pageEvidence(page, index))
  ];

  const firstPage = pages[0];
  const detectedSiteType = config.siteType === "auto" ? classifySite(baseUrl, pages) : config.siteType;
  const framework =
    config.framework ?? (firstPage ? detectFramework(firstPage.headers, firstPage.bodyExcerpt) : "unknown");

  return {
    scanId,
    startedAt,
    completedAt: new Date().toISOString(),
    config,
    siteType: detectedSiteType,
    framework,
    discovery,
    pages,
    evidence,
    crawlGraph
  };
}

async function collectNestedSitemapUrls(
  sitemapUrls: string[],
  origin: string,
  config: ScanConfig
): Promise<string[]> {
  const pageUrls: string[] = [];
  for (const sitemapUrl of sitemapUrls.slice(0, 20)) {
    try {
      const normalized = normalizeUrl(sitemapUrl);
      if (!sameOrigin(normalized, origin)) {
        continue;
      }
      const probe = await probeEndpoint(normalized, "", config);
      if (!probe.ok) {
        continue;
      }
      pageUrls.push(...parseSitemapXml(probe.bodyExcerpt).urls);
    } catch {
      // Malformed nested sitemap URL is surfaced by sitemap rules from endpoint evidence.
    }
  }
  return pageUrls;
}

function hasSitemapIndexRoot(xml: string): boolean {
  return xml.toLowerCase().includes("<sitemapindex");
}

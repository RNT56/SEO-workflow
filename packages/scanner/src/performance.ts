import type {
  EndpointProbe,
  FetchTimingSnapshot,
  PageSnapshot,
  PerformanceAudit,
  PerformanceBudget,
  PerformanceMetricSnapshot,
  ResourceTimingSnapshot,
  ScanConfig
} from "@seo-polish/schemas";
import { fetchUrl } from "./fetch.js";
import { discoverResources } from "./resourceDiscovery.js";

const RESOURCE_MEASUREMENT_LIMIT = 40;
const PERFORMANCE_URL_LIMIT = 5;

export interface BuildPerformanceAuditInput {
  config: ScanConfig;
  origin: string;
  pages: PageSnapshot[];
  endpoints: Record<string, EndpointProbe>;
  pageHtml: Map<string, string>;
}

export async function buildPerformanceAudit(input: BuildPerformanceAuditInput): Promise<PerformanceAudit> {
  const budgets = input.config.performanceBudgets ?? {};
  const resources = dedupeResources(
    input.pages.flatMap((page) => discoverResources(input.pageHtml.get(page.finalUrl) ?? "", page.finalUrl))
  );
  const measuredResources = await measureResources(resources, input.config);
  const fetchTimings = await collectFetchTimings(input);
  const summary = summarizePerformance(fetchTimings, measuredResources);
  const metrics = buildMetrics(summary, budgets);

  return {
    generatedAt: new Date().toISOString(),
    budgets,
    profiles: [
      {
        id: "http-fetch",
        label: "HTTP fetch lab profile",
        runs: Math.max(1, input.config.performanceRuns ?? 1),
        reliability: "fetch_lab"
      }
    ],
    metrics,
    resources: measuredResources,
    fetchTimings,
    summary,
    limitations: [
      "HTTP fetch timings and static resource discovery are measured, but browser rendering metrics are not collected in this run.",
      "LCP, INP, CLS and true TTFB require browser/CDP or field data and are marked not_measured when unavailable.",
      "Resource byte totals use Content-Length headers when available and are lower bounds when servers omit them."
    ]
  };
}

async function collectFetchTimings(input: BuildPerformanceAuditInput): Promise<FetchTimingSnapshot[]> {
  const crawlTimings = [
    ...Object.values(input.endpoints)
      .map((endpoint) => endpoint.timing)
      .filter((timing): timing is FetchTimingSnapshot => Boolean(timing)),
    ...input.pages
      .map((page) => page.timing)
      .filter((timing): timing is FetchTimingSnapshot => Boolean(timing))
  ];
  const runs = Math.max(1, Math.min(5, input.config.performanceRuns ?? 1));
  if (runs <= 1) {
    return crawlTimings;
  }

  const selectedPages = input.pages.slice(0, PERFORMANCE_URL_LIMIT);
  const repeated: FetchTimingSnapshot[] = [];
  for (let run = 2; run <= runs; run += 1) {
    for (const page of selectedPages) {
      try {
        const response = await fetchUrl(page.finalUrl, input.config, "text/html,application/xhtml+xml");
        repeated.push({
          ...response.timing,
          run,
          profile: run === 2 ? "cold" : "warm"
        });
      } catch (error) {
        const timing = timingFromError(error);
        if (timing) {
          repeated.push({ ...timing, run, profile: run === 2 ? "cold" : "warm" });
        }
      }
    }
  }
  return [...crawlTimings, ...repeated];
}

async function measureResources(
  resources: ResourceTimingSnapshot[],
  config: Pick<ScanConfig, "timeoutMs" | "userAgent">
): Promise<ResourceTimingSnapshot[]> {
  const measured: ResourceTimingSnapshot[] = [];
  for (const resource of resources.slice(0, RESOURCE_MEASUREMENT_LIMIT)) {
    measured.push(await measureResource(resource, config));
  }
  measured.push(...resources.slice(RESOURCE_MEASUREMENT_LIMIT));
  return measured;
}

async function measureResource(
  resource: ResourceTimingSnapshot,
  config: Pick<ScanConfig, "timeoutMs" | "userAgent">
): Promise<ResourceTimingSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(resource.url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": config.userAgent },
      signal: controller.signal
    });
    const length = response.headers.get("content-length");
    return {
      ...resource,
      status: response.status,
      ...(length ? { bytes: Number(length) } : {}),
      totalMs: Math.max(0, Math.round(performance.now() - started))
    };
  } catch {
    return {
      ...resource,
      status: null,
      totalMs: Math.max(0, Math.round(performance.now() - started))
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizePerformance(
  fetchTimings: FetchTimingSnapshot[],
  resources: ResourceTimingSnapshot[]
): PerformanceAudit["summary"] {
  const documentTimings = fetchTimings.filter((timing) => /html|xhtml/i.test(timing.contentType ?? ""));
  const documentDurations = documentTimings.map((timing) => timing.totalMs).sort((a, b) => a - b);
  const jsResources = resources.filter((resource) => resource.type === "script");
  const cssResources = resources.filter((resource) => resource.type === "stylesheet");
  const imageResources = resources.filter((resource) => resource.type === "image");
  const thirdPartyJsResources = jsResources.filter((resource) => resource.thirdParty);

  return {
    totalRequests: resources.length + documentTimings.length,
    sameOriginRequests: resources.filter((resource) => resource.sameOrigin).length + documentTimings.length,
    thirdPartyRequests: resources.filter((resource) => resource.thirdParty).length,
    renderBlockingRequests: resources.filter((resource) => resource.renderBlocking).length,
    totalJsKb: bytesToKb(sumBytes(jsResources)),
    thirdPartyJsKb: bytesToKb(sumBytes(thirdPartyJsResources)),
    totalCssKb: bytesToKb(sumBytes(cssResources)),
    imageBytesKb: bytesToKb(sumBytes(imageResources)),
    medianDocumentFetchMs: percentile(documentDurations, 0.5),
    p95DocumentFetchMs: percentile(documentDurations, 0.95)
  };
}

function buildMetrics(
  summary: PerformanceAudit["summary"],
  budgets: PerformanceBudget
): PerformanceMetricSnapshot[] {
  return [
    budgetMetric(
      "document-fetch-ms",
      "Document fetch duration",
      summary.medianDocumentFetchMs,
      "ms",
      budgets.documentFetchMs,
      "fetch_lab",
      ["Median measured from repeated HTTP document fetches."]
    ),
    budgetMetric("lcp-ms", "Largest Contentful Paint", null, "ms", budgets.lcpMs, "not_measured", [
      "Browser rendering evidence was not collected."
    ]),
    budgetMetric("inp-ms", "Interaction to Next Paint", null, "ms", budgets.inpMs, "not_measured", [
      "Browser interaction evidence was not collected."
    ]),
    budgetMetric("cls", "Cumulative Layout Shift", null, "score", budgets.cls, "not_measured", [
      "Browser layout shift evidence was not collected."
    ]),
    budgetMetric(
      "total-requests",
      "Total request pressure",
      summary.totalRequests,
      "count",
      budgets.totalRequests,
      "heuristic",
      ["Document fetches plus statically discovered resource URLs."]
    ),
    budgetMetric(
      "render-blocking-requests",
      "Render-blocking request pressure",
      summary.renderBlockingRequests,
      "count",
      budgets.renderBlockingRequests,
      "heuristic",
      ["Static scripts without async/defer and stylesheet links discovered in raw HTML."]
    ),
    budgetMetric(
      "total-js-kb",
      "JavaScript transfer",
      summary.totalJsKb,
      "kb",
      budgets.totalJsKb,
      "fetch_lab",
      ["Known Content-Length bytes for discovered script resources."]
    ),
    budgetMetric(
      "third-party-js-kb",
      "Third-party JavaScript transfer",
      summary.thirdPartyJsKb,
      "kb",
      budgets.thirdPartyJsKb,
      "fetch_lab",
      ["Known Content-Length bytes for third-party script resources."]
    ),
    budgetMetric("total-css-kb", "CSS transfer", summary.totalCssKb, "kb", budgets.totalCssKb, "fetch_lab", [
      "Known Content-Length bytes for discovered stylesheet resources."
    ]),
    budgetMetric(
      "image-bytes-kb",
      "Image transfer",
      summary.imageBytesKb,
      "kb",
      budgets.imageBytesKb,
      "fetch_lab",
      ["Known Content-Length bytes for discovered image resources."]
    )
  ];
}

function budgetMetric(
  id: string,
  label: string,
  value: number | null,
  unit: PerformanceMetricSnapshot["unit"],
  budget: number | undefined,
  reliability: PerformanceMetricSnapshot["reliability"],
  evidence: string[]
): PerformanceMetricSnapshot {
  return {
    id,
    label,
    value,
    unit,
    ...(budget !== undefined ? { budget } : {}),
    status: metricStatus(value, budget),
    reliability,
    evidence
  };
}

function metricStatus(value: number | null, budget: number | undefined): PerformanceMetricSnapshot["status"] {
  if (value === null || budget === undefined) {
    return "not_measured";
  }
  if (value <= budget) {
    return "passed";
  }
  if (value <= budget * 1.15) {
    return "warning";
  }
  return "failed";
}

function dedupeResources(resources: ResourceTimingSnapshot[]): ResourceTimingSnapshot[] {
  const byUrl = new Map<string, ResourceTimingSnapshot>();
  for (const resource of resources) {
    const existing = byUrl.get(resource.url);
    if (existing) {
      byUrl.set(resource.url, {
        ...existing,
        renderBlocking: existing.renderBlocking || resource.renderBlocking,
        async: existing.async || resource.async,
        defer: existing.defer || resource.defer,
        lazy: existing.lazy || resource.lazy
      });
    } else {
      byUrl.set(resource.url, resource);
    }
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function sumBytes(resources: ResourceTimingSnapshot[]): number {
  return resources.reduce((sum, resource) => sum + (resource.bytes ?? 0), 0);
}

function bytesToKb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
  return values[index] ?? null;
}

function timingFromError(error: unknown): FetchTimingSnapshot | null {
  if (!error || typeof error !== "object" || !("timing" in error)) {
    return null;
  }
  const timing = (error as { timing?: unknown }).timing;
  return timing && typeof timing === "object" ? (timing as FetchTimingSnapshot) : null;
}

import type {
  BrowserEvidenceReport,
  EndpointProbe,
  FieldDataReport,
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
  browserEvidence?: BrowserEvidenceReport;
  fieldData?: FieldDataReport;
}

export async function buildPerformanceAudit(input: BuildPerformanceAuditInput): Promise<PerformanceAudit> {
  const budgets = input.config.performanceBudgets ?? {};
  const resources = dedupeResources(
    input.pages.flatMap((page) => discoverResources(input.pageHtml.get(page.finalUrl) ?? "", page.finalUrl))
  );
  const measuredResources = await measureResources(resources, input.config);
  const fetchTimings = await collectFetchTimings(input);
  const summary = summarizePerformance(fetchTimings, measuredResources);
  const browserMetrics = summarizeBrowserMetrics(input.browserEvidence);
  const fieldMetrics = summarizeFieldMetrics(input.fieldData);
  const metrics = buildMetrics(summary, budgets, browserMetrics, fieldMetrics);

  return {
    generatedAt: new Date().toISOString(),
    budgets,
    profiles: [
      {
        id: "http-fetch",
        label: "HTTP fetch lab profile",
        runs: Math.max(1, input.config.performanceRuns ?? 1),
        reliability: "fetch_lab"
      },
      ...(input.browserEvidence?.status === "ok"
        ? [
            {
              id: "browser-lab",
              label: "Browser rendering lab profile",
              runs: input.browserEvidence.pages.length,
              reliability: "browser_lab" as const
            }
          ]
        : []),
      ...(input.fieldData && input.fieldData.status !== "disabled"
        ? [
            {
              id: "field-data",
              label: "Real-user field data profile",
              runs: Math.max(1, input.fieldData.summary.providersAvailable.length),
              reliability: "field" as const
            }
          ]
        : [])
    ],
    metrics,
    resources: measuredResources,
    fetchTimings,
    summary,
    limitations: [
      ...(input.browserEvidence?.status === "ok"
        ? [
            "Browser lab evidence was collected for a bounded sample of crawled pages.",
            "INP requires scripted interactions or field data and is marked not_measured when unavailable."
          ]
        : [
            "HTTP fetch timings and static resource discovery are measured, but browser rendering metrics are not collected in this run.",
            "LCP, INP, CLS and true TTFB require browser/CDP or field data and are marked not_measured when unavailable."
          ]),
      ...(input.fieldData && input.fieldData.status !== "disabled"
        ? [
            "Field data was requested; available RUM and CrUX p75 metrics take precedence over lab metrics.",
            "Search Console traffic data is used for prioritization context, not raw performance timing."
          ]
        : []),
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

interface BrowserMetricSummary {
  ttfbMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
}

interface FieldMetricSummary {
  ttfbMs: SourceMetric;
  fcpMs: SourceMetric;
  lcpMs: SourceMetric;
  inpMs: SourceMetric;
  cls: SourceMetric;
}

interface SourceMetric {
  value: number | null;
  source: "rum" | "crux" | null;
}

function buildMetrics(
  summary: PerformanceAudit["summary"],
  budgets: PerformanceBudget,
  browserMetrics: BrowserMetricSummary,
  fieldMetrics: FieldMetricSummary
): PerformanceMetricSnapshot[] {
  const ttfb = chooseMetric(fieldMetrics.ttfbMs, browserMetrics.ttfbMs);
  const fcp = chooseMetric(fieldMetrics.fcpMs, browserMetrics.fcpMs);
  const lcp = chooseMetric(fieldMetrics.lcpMs, browserMetrics.lcpMs);
  const inp = chooseMetric(fieldMetrics.inpMs, null);
  const cls = chooseMetric(fieldMetrics.cls, browserMetrics.cls);
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
    budgetMetric(
      "ttfb-ms",
      "Browser time to first byte",
      ttfb.value,
      "ms",
      budgets.ttfbMs,
      ttfb.reliability,
      ttfb.value === null
        ? ["Browser navigation timing evidence was not collected."]
        : [
            metricEvidenceText(
              ttfb.source,
              "TTFB",
              "Median browser navigation responseStart minus requestStart from sampled pages."
            )
          ]
    ),
    budgetMetric(
      "fcp-ms",
      "First Contentful Paint",
      fcp.value,
      "ms",
      undefined,
      fcp.reliability,
      fcp.value === null
        ? ["Browser paint timing evidence was not collected."]
        : [metricEvidenceText(fcp.source, "FCP", "Median browser paint timing from sampled pages.")]
    ),
    budgetMetric(
      "lcp-ms",
      "Largest Contentful Paint",
      lcp.value,
      "ms",
      budgets.lcpMs,
      lcp.reliability,
      lcp.value === null
        ? ["Browser rendering evidence was not collected."]
        : [
            metricEvidenceText(
              lcp.source,
              "LCP",
              "Median browser Largest Contentful Paint from sampled pages."
            )
          ]
    ),
    budgetMetric(
      "inp-ms",
      "Interaction to Next Paint",
      inp.value,
      "ms",
      budgets.inpMs,
      inp.reliability,
      inp.value === null
        ? ["Browser interaction or field evidence was not collected."]
        : [metricEvidenceText(inp.source, "INP", "Field Interaction to Next Paint p75.")]
    ),
    budgetMetric(
      "cls",
      "Cumulative Layout Shift",
      cls.value,
      "score",
      budgets.cls,
      cls.reliability,
      cls.value === null
        ? ["Browser layout shift evidence was not collected."]
        : [
            metricEvidenceText(
              cls.source,
              "CLS",
              "Maximum browser Cumulative Layout Shift from sampled pages."
            )
          ]
    ),
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

function summarizeBrowserMetrics(browserEvidence: BrowserEvidenceReport | undefined): BrowserMetricSummary {
  if (!browserEvidence || browserEvidence.status !== "ok") {
    return { ttfbMs: null, fcpMs: null, lcpMs: null, cls: null };
  }
  const pages = browserEvidence.pages;
  return {
    ttfbMs: median(pages.map((page) => page.metrics.ttfbMs).filter(isNumber)),
    fcpMs: median(pages.map((page) => page.metrics.firstContentfulPaintMs).filter(isNumber)),
    lcpMs: median(pages.map((page) => page.metrics.largestContentfulPaintMs).filter(isNumber)),
    cls: maxOrNull(pages.map((page) => page.metrics.cumulativeLayoutShift).filter(isNumber))
  };
}

function summarizeFieldMetrics(fieldData: FieldDataReport | undefined): FieldMetricSummary {
  return {
    ttfbMs: sourceMetric(
      fieldData?.rum?.summary.p75.TTFB ?? null,
      "rum",
      fieldData?.summary.origin.ttfbP75Ms ?? null,
      "crux"
    ),
    fcpMs: sourceMetric(
      fieldData?.rum?.summary.p75.FCP ?? null,
      "rum",
      cruxP75(fieldData, "first_contentful_paint"),
      "crux"
    ),
    lcpMs: sourceMetric(
      fieldData?.summary.rum.lcpP75Ms ?? null,
      "rum",
      fieldData?.summary.origin.lcpP75Ms ?? null,
      "crux"
    ),
    inpMs: sourceMetric(
      fieldData?.summary.rum.inpP75Ms ?? null,
      "rum",
      fieldData?.summary.origin.inpP75Ms ?? null,
      "crux"
    ),
    cls: sourceMetric(
      fieldData?.summary.rum.clsP75 ?? null,
      "rum",
      fieldData?.summary.origin.clsP75 ?? null,
      "crux"
    )
  };
}

function sourceMetric(
  primaryValue: number | null | undefined,
  primarySource: SourceMetric["source"],
  fallbackValue: number | null | undefined,
  fallbackSource: SourceMetric["source"]
): SourceMetric {
  if (typeof primaryValue === "number") return { value: primaryValue, source: primarySource };
  if (typeof fallbackValue === "number") return { value: fallbackValue, source: fallbackSource };
  return { value: null, source: null };
}

function cruxP75(fieldData: FieldDataReport | undefined, metric: "first_contentful_paint"): number | null {
  return fieldData?.crux?.summary.originP75[metric] ?? null;
}

function chooseMetric(
  fieldMetric: SourceMetric,
  browserValue: number | null
): {
  value: number | null;
  reliability: PerformanceMetricSnapshot["reliability"];
  source: SourceMetric["source"] | "browser" | null;
} {
  if (fieldMetric.value !== null) {
    return { value: fieldMetric.value, reliability: "field", source: fieldMetric.source };
  }
  if (browserValue !== null) {
    return { value: browserValue, reliability: "browser_lab", source: "browser" };
  }
  return { value: null, reliability: "not_measured", source: null };
}

function metricEvidenceText(
  source: SourceMetric["source"] | "browser" | null,
  metric: string,
  browserFallback: string
): string {
  if (source === "rum") return `First-party RUM ${metric} p75 from supplied Web Vitals export.`;
  if (source === "crux") return `CrUX origin-level real-user ${metric} p75.`;
  return browserFallback;
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
  if (value === null) {
    return "not_measured";
  }
  if (budget === undefined) {
    return "passed";
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

function median(values: number[]): number | null {
  return percentile(
    [...values].sort((a, b) => a - b),
    0.5
  );
}

function maxOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function timingFromError(error: unknown): FetchTimingSnapshot | null {
  if (!error || typeof error !== "object" || !("timing" in error)) {
    return null;
  }
  const timing = (error as { timing?: unknown }).timing;
  return timing && typeof timing === "object" ? (timing as FetchTimingSnapshot) : null;
}

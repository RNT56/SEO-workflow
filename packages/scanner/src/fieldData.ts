import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CruxFieldDataReport,
  CruxFormFactor,
  CruxHistoryMetricPoint,
  CruxHistoryRecord,
  CruxMetricName,
  CruxMetricResult,
  CruxRecordEvidence,
  FieldDataProvider,
  FieldDataReport,
  FieldDataStatus,
  GscSearchAnalyticsRow,
  GscUrlInspectionResult,
  PageSnapshot,
  RumVitalsMetric,
  RumVitalsReport,
  ScanConfig,
  SearchConsoleReport
} from "@seo-polish/schemas";

const CRUX_RECORD_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const CRUX_HISTORY_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";
const GSC_SEARCH_ANALYTICS_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";
const GSC_URL_INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const CRUX_METRICS: CruxMetricName[] = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
  "first_contentful_paint",
  "experimental_time_to_first_byte"
];
const CRUX_FORM_FACTORS: CruxFormFactor[] = ["ALL", "PHONE", "DESKTOP"];

export interface CollectFieldDataInput {
  config: ScanConfig;
  pages: PageSnapshot[];
  origin: string;
}

interface CruxApiMetric {
  histogram?: Array<{ start?: number | string; end?: number | string; density?: number }>;
  percentiles?: { p75?: number | string | null };
  histogramTimeseries?: Array<{
    start?: number | string;
    end?: number | string;
    densities?: Array<number | string | null>;
  }>;
  percentilesTimeseries?: { p75s?: Array<number | string | null> };
}

interface CruxApiResponse {
  record?: {
    collectionPeriod?: { firstDate?: CruxDate; lastDate?: CruxDate };
    collectionPeriods?: Array<{ firstDate?: CruxDate; lastDate?: CruxDate }>;
    metrics?: Partial<Record<CruxMetricName, CruxApiMetric>>;
  };
  urlNormalizationDetails?: {
    normalizedUrl?: string;
  };
}

interface CruxDate {
  year?: number;
  month?: number;
  day?: number;
}

interface GscSearchAnalyticsResponse {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
}

interface GscUrlInspectionResponse {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      referringUrls?: string[];
    };
  };
}

interface RawRumMetric {
  metric?: unknown;
  name?: unknown;
  p75?: unknown;
  value?: unknown;
  unit?: unknown;
  samples?: unknown;
  sampleCount?: unknown;
  goodRate?: unknown;
  url?: unknown;
  route?: unknown;
  device?: unknown;
}

export async function collectFieldData(input: CollectFieldDataInput): Promise<FieldDataReport> {
  const providers = normalizeProviders(input.config.fieldDataProviders);
  if (providers.length === 0) {
    return emptyFieldData("disabled", false, [], ["Field data providers were not requested."]);
  }

  const crux = providers.includes("crux") ? await collectCruxFieldData(input) : undefined;
  const searchConsole = providers.includes("gsc") ? await collectSearchConsoleData(input) : undefined;
  const rum = providers.includes("rum") ? await collectRumVitals(input.config) : undefined;
  return buildFieldDataReport(providers, crux, searchConsole, rum);
}

export function fieldDataRequested(config: ScanConfig): boolean {
  return normalizeProviders(config.fieldDataProviders).length > 0;
}

async function collectCruxFieldData(input: CollectFieldDataInput): Promise<CruxFieldDataReport> {
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.SEO_POLISH_CRUX_API_KEY ?? process.env.CRUX_API_KEY;
  const origin = input.origin;
  if (!apiKey) {
    return emptyCruxReport("unavailable", true, origin, [
      "CrUX provider was requested, but SEO_POLISH_CRUX_API_KEY is not set."
    ]);
  }

  const urls = sampledPageUrls(input.pages, input.config.fieldDataUrlLimit ?? 3);
  const records: CruxRecordEvidence[] = [];
  for (const formFactor of CRUX_FORM_FACTORS) {
    records.push(await queryCruxRecord(apiKey, "origin", origin, formFactor, input.config.timeoutMs));
  }
  for (const url of urls) {
    records.push(await queryCruxRecord(apiKey, "url", url, "ALL", input.config.timeoutMs));
  }

  const history = input.config.includeCruxHistory
    ? [await queryCruxHistory(apiKey, origin, "ALL", input.config.timeoutMs)]
    : [
        {
          scope: "origin" as const,
          url: origin,
          formFactor: "ALL" as const,
          status: "disabled" as const,
          points: []
        }
      ];
  const summary = summarizeCruxRecords(records);
  const status = providerStatus(records.map((record) => record.status));
  return {
    generatedAt,
    status,
    requested: true,
    source: "crux_api",
    origin,
    formFactors: CRUX_FORM_FACTORS,
    records,
    history,
    summary,
    limitations: [
      "CrUX is aggregated Chrome real-user data and may be unavailable for low-traffic URLs.",
      "CrUX p75 values are rolling aggregate field metrics, not per-pageview diagnostics.",
      ...(input.config.includeCruxHistory ? [] : ["CrUX history collection was not requested."])
    ]
  };
}

async function queryCruxRecord(
  apiKey: string,
  scope: "origin" | "url",
  targetUrl: string,
  formFactor: CruxFormFactor,
  timeoutMs: number
): Promise<CruxRecordEvidence> {
  const body = cruxBody(scope, targetUrl, formFactor);
  try {
    const response = await postJson<CruxApiResponse>(
      `${CRUX_RECORD_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
      body,
      {},
      timeoutMs
    );
    const period = collectionPeriod(response.record?.collectionPeriod);
    return {
      scope,
      url: targetUrl,
      formFactor,
      status: "ok",
      ...(period ? { collectionPeriod: period } : {}),
      ...(response.urlNormalizationDetails?.normalizedUrl
        ? { normalizedUrl: response.urlNormalizationDetails.normalizedUrl }
        : {}),
      metrics: normalizeCruxMetrics(response.record?.metrics ?? {})
    };
  } catch (error) {
    return {
      scope,
      url: targetUrl,
      formFactor,
      status: httpStatus(error) === 404 ? "not_found" : "failed",
      metrics: [],
      error: errorMessage(error)
    };
  }
}

async function queryCruxHistory(
  apiKey: string,
  origin: string,
  formFactor: CruxFormFactor,
  timeoutMs: number
): Promise<CruxHistoryRecord> {
  try {
    const response = await postJson<CruxApiResponse>(
      `${CRUX_HISTORY_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
      { ...cruxBody("origin", origin, formFactor), collectionPeriodCount: 12 },
      {},
      timeoutMs
    );
    return {
      scope: "origin",
      url: origin,
      formFactor,
      status: "ok",
      points: normalizeCruxHistory(response)
    };
  } catch (error) {
    return {
      scope: "origin",
      url: origin,
      formFactor,
      status: httpStatus(error) === 404 ? "not_found" : "failed",
      points: [],
      error: errorMessage(error)
    };
  }
}

async function collectSearchConsoleData(input: CollectFieldDataInput): Promise<SearchConsoleReport> {
  const generatedAt = new Date().toISOString();
  const token = process.env.SEO_POLISH_GSC_ACCESS_TOKEN ?? process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN;
  const siteUrl = input.config.gscSiteUrl;
  const dates = searchConsoleDateRange(input.config);
  const rowLimit = boundedNumber(input.config.gscRowLimit, 250, 1, 25000);
  const inspectionLimit = boundedNumber(input.config.gscInspectionLimit, 5, 0, 50);

  if (!siteUrl) {
    return emptySearchConsoleReport("unavailable", true, undefined, dates, rowLimit, inspectionLimit, [
      "GSC provider was requested, but --gsc-site was not supplied."
    ]);
  }
  if (!token) {
    return emptySearchConsoleReport("unavailable", true, siteUrl, dates, rowLimit, inspectionLimit, [
      "GSC provider was requested, but SEO_POLISH_GSC_ACCESS_TOKEN is not set."
    ]);
  }

  const analytics = await querySearchAnalytics(siteUrl, token, dates, rowLimit, input.config.timeoutMs);
  const inspection = await inspectUrls(
    siteUrl,
    token,
    sampledPageUrls(input.pages, inspectionLimit),
    inspectionLimit,
    input.config.timeoutMs
  );
  const summary = summarizeSearchConsole(analytics.rows, inspection.results);
  return {
    generatedAt,
    status: mergeProviderStatuses([analytics.status, inspection.status]),
    requested: true,
    siteUrl,
    dateRange: dates,
    searchAnalytics: analytics,
    urlInspection: inspection,
    summary,
    limitations: [
      "Search Console data requires owner authorization and is limited to the supplied property.",
      "Search Analytics returns top rows within Search Console API limits, not every query impression.",
      "URL Inspection reports Google's indexed version; it is not a live URL test."
    ]
  };
}

async function collectRumVitals(config: ScanConfig): Promise<RumVitalsReport> {
  const generatedAt = new Date().toISOString();
  if (!config.rumDataPath) {
    return emptyRumReport("unavailable", true, undefined, [
      "RUM provider was requested, but --rum-file was not supplied."
    ]);
  }

  const sourcePath = resolve(process.cwd(), config.rumDataPath);
  try {
    const raw = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
    const metrics = normalizeRumMetrics(raw);
    if (metrics.length === 0) {
      return emptyRumReport("unavailable", true, sourcePath, [
        "RUM file did not contain recognizable Web Vitals metrics."
      ]);
    }
    return {
      generatedAt,
      status: "ok",
      requested: true,
      sourcePath,
      metrics,
      summary: summarizeRum(metrics),
      limitations: [
        "RUM data is trusted as first-party input; verify collection methodology before comparing across sites.",
        "Accepted metrics are normalized from p75 rows or raw web-vitals style event rows."
      ]
    };
  } catch (error) {
    return emptyRumReport("failed", true, sourcePath, [`Failed to read RUM file: ${errorMessage(error)}`]);
  }
}

async function querySearchAnalytics(
  siteUrl: string,
  token: string,
  dates: { startDate: string; endDate: string },
  rowLimit: number,
  timeoutMs: number
): Promise<SearchConsoleReport["searchAnalytics"]> {
  try {
    const response = await postJson<GscSearchAnalyticsResponse>(
      `${GSC_SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate: dates.startDate,
        endDate: dates.endDate,
        dimensions: ["page", "query", "device"],
        rowLimit
      },
      { Authorization: `Bearer ${token}` },
      timeoutMs
    );
    const rows = normalizeSearchRows(response.rows ?? []);
    return {
      status: "ok",
      dimensions: ["page", "query", "device"],
      rowLimit,
      rows,
      totals: searchTotals(rows)
    };
  } catch (error) {
    return {
      status: httpStatus(error) === 401 || httpStatus(error) === 403 ? "unavailable" : "failed",
      dimensions: ["page", "query", "device"],
      rowLimit,
      rows: [],
      totals: { clicks: 0, impressions: 0, averageCtr: null, averagePosition: null },
      error: errorMessage(error)
    };
  }
}

async function inspectUrls(
  siteUrl: string,
  token: string,
  urls: string[],
  limit: number,
  timeoutMs: number
): Promise<SearchConsoleReport["urlInspection"]> {
  if (limit === 0) {
    return { status: "disabled", inspected: 0, limit, results: [] };
  }

  const results: GscUrlInspectionResult[] = [];
  for (const inspectionUrl of urls) {
    try {
      const response = await postJson<GscUrlInspectionResponse>(
        GSC_URL_INSPECTION_ENDPOINT,
        { inspectionUrl, siteUrl, languageCode: "en-US" },
        { Authorization: `Bearer ${token}` },
        timeoutMs
      );
      const index = response.inspectionResult?.indexStatusResult;
      results.push({
        inspectionUrl,
        status: "ok",
        ...(index?.verdict ? { verdict: index.verdict } : {}),
        ...(index?.coverageState ? { coverageState: index.coverageState } : {}),
        ...(index?.robotsTxtState ? { robotsTxtState: index.robotsTxtState } : {}),
        ...(index?.indexingState ? { indexingState: index.indexingState } : {}),
        ...(index?.lastCrawlTime ? { lastCrawlTime: index.lastCrawlTime } : {}),
        ...(index?.pageFetchState ? { pageFetchState: index.pageFetchState } : {}),
        ...(index?.googleCanonical ? { googleCanonical: index.googleCanonical } : {}),
        ...(index?.userCanonical ? { userCanonical: index.userCanonical } : {}),
        referringUrls: index?.referringUrls ?? [],
        rawResultAvailable: Boolean(index)
      });
    } catch (error) {
      results.push({
        inspectionUrl,
        status: "failed",
        referringUrls: [],
        rawResultAvailable: false,
        error: errorMessage(error)
      });
    }
  }

  const ok = results.filter((result) => result.status === "ok").length;
  return {
    status: ok === results.length ? "ok" : ok > 0 ? "partial" : "failed",
    inspected: results.length,
    limit,
    results
  };
}

function buildFieldDataReport(
  providersRequested: FieldDataProvider[],
  crux?: CruxFieldDataReport,
  searchConsole?: SearchConsoleReport,
  rum?: RumVitalsReport
): FieldDataReport {
  const providerStatuses = [crux?.status, searchConsole?.status, rum?.status].filter(
    (status): status is FieldDataStatus => Boolean(status)
  );
  const providersAvailable: FieldDataProvider[] = [
    ...(crux && (crux.status === "ok" || crux.status === "partial") ? ["crux" as const] : []),
    ...(searchConsole && (searchConsole.status === "ok" || searchConsole.status === "partial")
      ? ["gsc" as const]
      : []),
    ...(rum && rum.status === "ok" ? ["rum" as const] : [])
  ];
  return {
    generatedAt: new Date().toISOString(),
    status: mergeProviderStatuses(providerStatuses),
    requested: providersRequested.length > 0,
    providersRequested,
    ...(crux ? { crux } : {}),
    ...(searchConsole ? { searchConsole } : {}),
    ...(rum ? { rum } : {}),
    summary: {
      providersAvailable,
      metricCoverage: {
        crux: {
          largest_contentful_paint: cruxMetricAvailable(crux, "largest_contentful_paint"),
          interaction_to_next_paint: cruxMetricAvailable(crux, "interaction_to_next_paint"),
          cumulative_layout_shift: cruxMetricAvailable(crux, "cumulative_layout_shift"),
          first_contentful_paint: cruxMetricAvailable(crux, "first_contentful_paint"),
          experimental_time_to_first_byte: cruxMetricAvailable(crux, "experimental_time_to_first_byte")
        },
        rum: {
          LCP: rumMetricAvailable(rum, "LCP"),
          INP: rumMetricAvailable(rum, "INP"),
          CLS: rumMetricAvailable(rum, "CLS"),
          TTFB: rumMetricAvailable(rum, "TTFB"),
          FCP: rumMetricAvailable(rum, "FCP")
        },
        gsc: {
          searchAnalytics: Boolean(searchConsole?.searchAnalytics.rows.length),
          urlInspection: Boolean(searchConsole?.urlInspection.results.length)
        }
      },
      origin: {
        lcpP75Ms: crux?.summary.originP75.largest_contentful_paint ?? null,
        inpP75Ms: crux?.summary.originP75.interaction_to_next_paint ?? null,
        clsP75: crux?.summary.originP75.cumulative_layout_shift ?? null,
        ttfbP75Ms: crux?.summary.originP75.experimental_time_to_first_byte ?? null
      },
      searchConsole: {
        clicks: searchConsole?.searchAnalytics.totals.clicks ?? null,
        impressions: searchConsole?.searchAnalytics.totals.impressions ?? null,
        inspectedUrls: searchConsole?.urlInspection.inspected ?? 0,
        indexedUrls: searchConsole?.summary.indexedUrls ?? 0,
        nonIndexedUrls: searchConsole?.summary.nonIndexedUrls ?? 0
      },
      rum: {
        lcpP75Ms: rum?.summary.p75.LCP ?? null,
        inpP75Ms: rum?.summary.p75.INP ?? null,
        clsP75: rum?.summary.p75.CLS ?? null,
        samples: rum?.summary.sampleCount ?? null
      }
    },
    limitations: [
      ...(crux?.limitations ?? []),
      ...(searchConsole?.limitations ?? []),
      ...(rum?.limitations ?? [])
    ]
  };
}

function normalizeCruxMetrics(metrics: Partial<Record<CruxMetricName, CruxApiMetric>>): CruxMetricResult[] {
  return CRUX_METRICS.flatMap((metric) => {
    const value = metrics[metric];
    if (!value) return [];
    const histogram = (value.histogram ?? []).map((bin) => ({
      start: bin.start ?? null,
      end: bin.end ?? null,
      density: typeof bin.density === "number" ? bin.density : 0
    }));
    return [
      {
        metric,
        p75: numeric(value.percentiles?.p75),
        unit: metric === "cumulative_layout_shift" ? "score" : "ms",
        goodDensity: histogram[0]?.density ?? null,
        needsImprovementDensity: histogram[1]?.density ?? null,
        poorDensity: histogram[2]?.density ?? null,
        histogram
      }
    ];
  });
}

function normalizeCruxHistory(response: CruxApiResponse): CruxHistoryMetricPoint[] {
  const periods = response.record?.collectionPeriods ?? [];
  const metrics = response.record?.metrics ?? {};
  return CRUX_METRICS.flatMap((metric) => {
    const value = metrics[metric];
    if (!value?.percentilesTimeseries?.p75s) return [];
    const p75s = value.percentilesTimeseries.p75s;
    const histograms = value.histogramTimeseries ?? [];
    return p75s.map((p75, index) => ({
      date: formatCruxDate(periods[index]?.lastDate) ?? `period-${index + 1}`,
      metric,
      p75: numeric(p75),
      goodDensity: numeric(histograms[0]?.densities?.[index]),
      needsImprovementDensity: numeric(histograms[1]?.densities?.[index]),
      poorDensity: numeric(histograms[2]?.densities?.[index])
    }));
  });
}

function normalizeSearchRows(rows: NonNullable<GscSearchAnalyticsResponse["rows"]>): GscSearchAnalyticsRow[] {
  return rows.map((row) => {
    const keys = row.keys ?? [];
    return {
      keys,
      ...(keys[0] ? { page: keys[0] } : {}),
      ...(keys[1] ? { query: keys[1] } : {}),
      ...(keys[2] ? { device: keys[2] } : {}),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0
    };
  });
}

function normalizeRumMetrics(raw: unknown): RumVitalsMetric[] {
  const rows = rawRumRows(raw);
  const byMetric = new Map<RumVitalsMetric["metric"], number[]>();
  const normalizedRows: RumVitalsMetric[] = [];
  for (const row of rows) {
    const metric = normalizeRumMetricName(row.metric ?? row.name);
    if (!metric) continue;
    const value = numeric(row.p75 ?? row.value);
    if (value === null) continue;
    if (row.p75 !== undefined) {
      normalizedRows.push({
        metric,
        p75: value,
        unit: metric === "CLS" ? "score" : "ms",
        samples: numeric(row.samples ?? row.sampleCount),
        goodRate: numeric(row.goodRate),
        ...(typeof row.url === "string" ? { url: row.url } : {}),
        ...(typeof row.route === "string" ? { route: row.route } : {}),
        ...(typeof row.device === "string" ? { device: row.device } : {})
      });
    } else {
      const values = byMetric.get(metric) ?? [];
      values.push(value);
      byMetric.set(metric, values);
    }
  }

  for (const [metric, values] of byMetric) {
    normalizedRows.push({
      metric,
      p75: percentile(values, 0.75) ?? 0,
      unit: metric === "CLS" ? "score" : "ms",
      samples: values.length,
      goodRate: null
    });
  }
  return normalizedRows.sort((a, b) => a.metric.localeCompare(b.metric) || b.p75 - a.p75);
}

function rawRumRows(raw: unknown): RawRumMetric[] {
  if (Array.isArray(raw)) return raw as RawRumMetric[];
  if (!raw || typeof raw !== "object") return [];
  const record = raw as { metrics?: unknown; rows?: unknown; vitals?: unknown };
  if (Array.isArray(record.metrics)) return record.metrics as RawRumMetric[];
  if (Array.isArray(record.rows)) return record.rows as RawRumMetric[];
  if (Array.isArray(record.vitals)) return record.vitals as RawRumMetric[];
  return [];
}

function normalizeRumMetricName(value: unknown): RumVitalsMetric["metric"] | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  return upper === "LCP" || upper === "INP" || upper === "CLS" || upper === "TTFB" || upper === "FCP"
    ? upper
    : null;
}

function summarizeCruxRecords(records: CruxRecordEvidence[]): CruxFieldDataReport["summary"] {
  const origin = records.find((record) => record.scope === "origin" && record.formFactor === "ALL");
  const phone = records.find((record) => record.scope === "origin" && record.formFactor === "PHONE");
  const desktop = records.find((record) => record.scope === "origin" && record.formFactor === "DESKTOP");
  return {
    recordsOk: records.filter((record) => record.status === "ok").length,
    recordsNotFound: records.filter((record) => record.status === "not_found").length,
    recordsFailed: records.filter((record) => record.status === "failed").length,
    originP75: p75ByMetric(origin),
    phoneP75: p75ByMetric(phone),
    desktopP75: p75ByMetric(desktop)
  };
}

function summarizeSearchConsole(
  rows: GscSearchAnalyticsRow[],
  inspections: GscUrlInspectionResult[]
): SearchConsoleReport["summary"] {
  const pages = aggregateRows(rows, "page");
  const queries = aggregateRows(rows, "query");
  const indexed = inspections.filter(
    (result) =>
      result.status === "ok" &&
      (result.verdict === "PASS" || /^(indexed|submitted and indexed)\b/i.test(result.coverageState ?? ""))
  ).length;
  return {
    topPages: pages.slice(0, 10).map(({ key, clicks, impressions, position }) => ({
      page: key,
      clicks,
      impressions,
      position
    })),
    topQueries: queries.slice(0, 10).map(({ key, clicks, impressions, position }) => ({
      query: key,
      clicks,
      impressions,
      position
    })),
    indexedUrls: indexed,
    nonIndexedUrls: inspections.filter((result) => result.status === "ok").length - indexed
  };
}

function summarizeRum(metrics: RumVitalsMetric[]): RumVitalsReport["summary"] {
  const p75: Partial<Record<RumVitalsMetric["metric"], number>> = {};
  for (const metric of ["LCP", "INP", "CLS", "TTFB", "FCP"] as const) {
    const values = metrics.filter((item) => item.metric === metric).map((item) => item.p75);
    const value = percentile(values, 0.75);
    if (value !== null) p75[metric] = value;
  }
  return {
    metricCount: metrics.length,
    sampleCount: sumNullable(metrics.map((metric) => metric.samples)),
    p75,
    worstMetrics: [...metrics].sort((a, b) => metricSeverityValue(b) - metricSeverityValue(a)).slice(0, 8)
  };
}

function aggregateRows(
  rows: GscSearchAnalyticsRow[],
  key: "page" | "query"
): Array<{
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
}> {
  const map = new Map<string, { clicks: number; impressions: number; weightedPosition: number }>();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    const existing = map.get(value) ?? { clicks: 0, impressions: 0, weightedPosition: 0 };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.weightedPosition += row.position * row.impressions;
    map.set(value, existing);
  }
  return [...map.entries()]
    .map(([value, stats]) => ({
      key: value,
      clicks: stats.clicks,
      impressions: stats.impressions,
      position: stats.impressions > 0 ? round(stats.weightedPosition / stats.impressions, 2) : null
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.key.localeCompare(b.key));
}

function searchTotals(rows: GscSearchAnalyticsRow[]): SearchConsoleReport["searchAnalytics"]["totals"] {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks,
    impressions,
    averageCtr: impressions > 0 ? round(clicks / impressions, 4) : null,
    averagePosition:
      impressions > 0
        ? round(rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions, 2)
        : null
  };
}

function cruxBody(
  scope: "origin" | "url",
  targetUrl: string,
  formFactor: CruxFormFactor
): Record<string, unknown> {
  return {
    [scope]: targetUrl,
    ...(formFactor === "ALL" ? {} : { formFactor }),
    metrics: CRUX_METRICS
  };
}

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function emptyFieldData(
  status: FieldDataStatus,
  requested: boolean,
  providersRequested: FieldDataProvider[],
  limitations: string[]
): FieldDataReport {
  return {
    generatedAt: new Date().toISOString(),
    status,
    requested,
    providersRequested,
    summary: {
      providersAvailable: [],
      metricCoverage: {
        crux: {},
        rum: {},
        gsc: { searchAnalytics: false, urlInspection: false }
      },
      origin: { lcpP75Ms: null, inpP75Ms: null, clsP75: null, ttfbP75Ms: null },
      searchConsole: { clicks: null, impressions: null, inspectedUrls: 0, indexedUrls: 0, nonIndexedUrls: 0 },
      rum: { lcpP75Ms: null, inpP75Ms: null, clsP75: null, samples: null }
    },
    limitations
  };
}

function emptyCruxReport(
  status: FieldDataStatus,
  requested: boolean,
  origin: string,
  limitations: string[]
): CruxFieldDataReport {
  return {
    generatedAt: new Date().toISOString(),
    status,
    requested,
    source: "crux_api",
    origin,
    formFactors: CRUX_FORM_FACTORS,
    records: [],
    history: [],
    summary: {
      recordsOk: 0,
      recordsNotFound: 0,
      recordsFailed: 0,
      originP75: {},
      phoneP75: {},
      desktopP75: {}
    },
    limitations
  };
}

function emptySearchConsoleReport(
  status: FieldDataStatus,
  requested: boolean,
  siteUrl: string | undefined,
  dates: { startDate: string; endDate: string },
  rowLimit: number,
  inspectionLimit: number,
  limitations: string[]
): SearchConsoleReport {
  return {
    generatedAt: new Date().toISOString(),
    status,
    requested,
    ...(siteUrl ? { siteUrl } : {}),
    dateRange: dates,
    searchAnalytics: {
      status,
      dimensions: ["page", "query", "device"],
      rowLimit,
      rows: [],
      totals: { clicks: 0, impressions: 0, averageCtr: null, averagePosition: null }
    },
    urlInspection: { status, inspected: 0, limit: inspectionLimit, results: [] },
    summary: { topPages: [], topQueries: [], indexedUrls: 0, nonIndexedUrls: 0 },
    limitations
  };
}

function emptyRumReport(
  status: FieldDataStatus,
  requested: boolean,
  sourcePath: string | undefined,
  limitations: string[]
): RumVitalsReport {
  return {
    generatedAt: new Date().toISOString(),
    status,
    requested,
    ...(sourcePath ? { sourcePath } : {}),
    metrics: [],
    summary: { metricCount: 0, sampleCount: null, p75: {}, worstMetrics: [] },
    limitations
  };
}

function normalizeProviders(providers: FieldDataProvider[] | undefined): FieldDataProvider[] {
  const valid = new Set<FieldDataProvider>(["crux", "gsc", "rum"]);
  return [...new Set(providers ?? [])].filter((provider): provider is FieldDataProvider =>
    valid.has(provider)
  );
}

function providerStatus(statuses: Array<CruxRecordEvidence["status"]>): FieldDataStatus {
  const ok = statuses.filter((status) => status === "ok").length;
  if (statuses.length === 0) return "unavailable";
  if (ok === statuses.length) return "ok";
  if (ok > 0) return "partial";
  if (statuses.every((status) => status === "not_found")) return "unavailable";
  return "failed";
}

function mergeProviderStatuses(statuses: FieldDataStatus[]): FieldDataStatus {
  if (statuses.length === 0) return "disabled";
  if (statuses.every((status) => status === "disabled")) return "disabled";
  if (statuses.every((status) => status === "ok")) return "ok";
  if (statuses.some((status) => status === "ok" || status === "partial")) return "partial";
  if (statuses.every((status) => status === "unavailable" || status === "disabled")) return "unavailable";
  return "failed";
}

function sampledPageUrls(pages: PageSnapshot[], limit: number): string[] {
  return [...new Set(pages.map((page) => page.finalUrl))].slice(0, Math.max(0, limit));
}

function searchConsoleDateRange(config: ScanConfig): { startDate: string; endDate: string } {
  const now = new Date();
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setUTCDate(defaultEnd.getUTCDate() - 27);
  return {
    startDate: config.gscDateStart ?? defaultStart.toISOString().slice(0, 10),
    endDate: config.gscDateEnd ?? defaultEnd.toISOString().slice(0, 10)
  };
}

function collectionPeriod(
  period: { firstDate?: CruxDate; lastDate?: CruxDate } | undefined
): CruxRecordEvidence["collectionPeriod"] | undefined {
  const firstDate = formatCruxDate(period?.firstDate);
  const lastDate = formatCruxDate(period?.lastDate);
  return firstDate && lastDate ? { firstDate, lastDate } : undefined;
}

function formatCruxDate(date: CruxDate | undefined): string | null {
  if (!date?.year || !date.month || !date.day) return null;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function p75ByMetric(record: CruxRecordEvidence | undefined): Partial<Record<CruxMetricName, number>> {
  const result: Partial<Record<CruxMetricName, number>> = {};
  for (const metric of record?.metrics ?? []) {
    if (metric.p75 !== null) {
      result[metric.metric] = metric.p75;
    }
  }
  return result;
}

function cruxMetricAvailable(report: CruxFieldDataReport | undefined, metric: CruxMetricName): boolean {
  return Boolean(report?.records.some((record) => record.metrics.some((item) => item.metric === metric)));
}

function rumMetricAvailable(report: RumVitalsReport | undefined, metric: RumVitalsMetric["metric"]): boolean {
  return Boolean(report?.metrics.some((item) => item.metric === metric));
}

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "NaN") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percentile(values: number[], percentileValue: number): number | null {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? null;
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

function metricSeverityValue(metric: RumVitalsMetric): number {
  if (metric.metric === "CLS") return metric.p75 * 10000;
  return metric.p75;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function httpStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

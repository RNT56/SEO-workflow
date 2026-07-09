import { readFile } from "node:fs/promises";

export type MetricProviderId =
  | "google-search-console"
  | "crux"
  | "bing-webmaster-tools"
  | "indexnow"
  | "ga4"
  | "plausible"
  | "matomo"
  | "rum"
  | "other";

export interface ImportedMetricSource {
  provider: MetricProviderId;
  collectedAt: string;
  notes: string;
}

export interface ImportedMetric {
  source: ImportedMetricSource;
  metric: string;
  value: number;
  unit: string;
  url?: string;
  dimensions?: Record<string, string>;
}

export interface ProviderResult {
  provider: MetricProviderId;
  status: "ok" | "partial" | "unavailable" | "failed";
  collectedAt: string;
  metrics: ImportedMetric[];
  limitations: string[];
}

export interface SearchConsoleOptions {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
  endpoint?: string;
}

export interface CruxOptions {
  apiKey: string;
  origin: string;
  formFactor?: "PHONE" | "DESKTOP" | "TABLET";
  endpoint?: string;
}

export interface IndexNowOptions {
  host: string;
  key: string;
  urls: string[];
  keyLocation?: string;
  endpoint?: string;
  approved: boolean;
}

export function labelImportedMetric(metric: ImportedMetric): ImportedMetric {
  return metric;
}

export async function collectSearchConsoleMetrics(options: SearchConsoleOptions): Promise<ProviderResult> {
  if (!options.accessToken)
    return unavailable("google-search-console", "No owner-authorized access token was provided.");
  const endpoint = options.endpoint ?? "https://www.googleapis.com/webmasters/v3";
  const response = await fetch(
    `${endpoint.replace(/\/$/, "")}/sites/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        startDate: options.startDate,
        endDate: options.endDate,
        dimensions: ["page", "query", "device", "country"],
        rowLimit: boundedInteger(options.rowLimit ?? 1_000, 1, 25_000),
        dataState: "final"
      })
    }
  );
  if (!response.ok) throw new Error(`Search Console request failed with HTTP ${response.status}.`);
  const payload = (await response.json()) as {
    rows?: Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
  };
  const collectedAt = new Date().toISOString();
  const source: ImportedMetricSource = {
    provider: "google-search-console",
    collectedAt,
    notes:
      "Owner-authorized Search Analytics rows; these prioritize observed findings but do not create findings."
  };
  const metrics = (payload.rows ?? []).flatMap((row): ImportedMetric[] => {
    const [url, query, device, country] = row.keys ?? [];
    const dimensions = compactDimensions({ query, device, country });
    return [
      imported(source, "clicks", row.clicks ?? 0, "count", url, dimensions),
      imported(source, "impressions", row.impressions ?? 0, "count", url, dimensions),
      imported(source, "ctr", row.ctr ?? 0, "ratio", url, dimensions),
      imported(source, "position", row.position ?? 0, "average_position", url, dimensions)
    ];
  });
  return {
    provider: "google-search-console",
    status: metrics.length > 0 ? "ok" : "partial",
    collectedAt,
    metrics,
    limitations: metrics.length > 0 ? [] : ["The API returned no rows for the requested date range."]
  };
}

export async function collectCruxMetrics(options: CruxOptions): Promise<ProviderResult> {
  if (!options.apiKey) return unavailable("crux", "No CrUX API key was provided.");
  const endpoint = options.endpoint ?? "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set("key", options.apiKey);
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: new URL(options.origin).origin,
      formFactor: options.formFactor ?? "PHONE"
    })
  });
  if (!response.ok) throw new Error(`CrUX request failed with HTTP ${response.status}.`);
  const payload = (await response.json()) as {
    record?: { metrics?: Record<string, { percentiles?: { p75?: number | string } }> };
  };
  const collectedAt = new Date().toISOString();
  const source: ImportedMetricSource = {
    provider: "crux",
    collectedAt,
    notes: "Public aggregate Chrome field data at the 75th percentile."
  };
  const metrics = Object.entries(payload.record?.metrics ?? {}).flatMap(([metric, value]) => {
    const numeric = Number(value.percentiles?.p75);
    return Number.isFinite(numeric)
      ? [imported(source, metric, numeric, metric.includes("layout_shift") ? "ratio" : "ms", options.origin)]
      : [];
  });
  return {
    provider: "crux",
    status: metrics.length > 0 ? "ok" : "partial",
    collectedAt,
    metrics,
    limitations: metrics.length > 0 ? [] : ["CrUX had no p75 metric record for this origin and form factor."]
  };
}

export async function loadMetricFile(
  path: string,
  provider: MetricProviderId = "other"
): Promise<ProviderResult> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const rows = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw["metrics"])
      ? raw["metrics"]
      : [];
  const collectedAt = new Date().toISOString();
  const source: ImportedMetricSource = {
    provider,
    collectedAt,
    notes: "User-supplied metric export normalized without granting it finding authority."
  };
  const metrics = rows.flatMap((row): ImportedMetric[] => {
    if (!isObject(row) || typeof row["metric"] !== "string" || !Number.isFinite(Number(row["value"])))
      return [];
    return [
      imported(
        source,
        row["metric"],
        Number(row["value"]),
        typeof row["unit"] === "string" ? row["unit"] : "count",
        typeof row["url"] === "string" ? row["url"] : undefined
      )
    ];
  });
  return {
    provider,
    status: metrics.length > 0 ? "ok" : "failed",
    collectedAt,
    metrics,
    limitations: metrics.length > 0 ? [] : ["No valid metric rows were found in the supplied file."]
  };
}

export async function submitIndexNow(options: IndexNowOptions): Promise<{
  status: "submitted";
  httpStatus: number;
  submittedUrls: number;
}> {
  if (!options.approved) throw new Error("IndexNow submission requires explicit owner approval.");
  if (!/^[A-Za-z0-9-]{8,128}$/.test(options.key))
    throw new Error("IndexNow key must be 8-128 letters, digits or dashes.");
  const host = options.host.toLowerCase();
  const urls = [...new Set(options.urls)];
  if (urls.length === 0 || urls.length > 10_000)
    throw new Error("IndexNow requires 1-10,000 unique URLs per submission.");
  for (const value of urls) {
    if (new URL(value).hostname.toLowerCase() !== host)
      throw new Error(`IndexNow URL is outside approved host ${host}: ${value}`);
  }
  const response = await fetch(options.endpoint ?? "https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: options.key,
      ...(options.keyLocation ? { keyLocation: options.keyLocation } : {}),
      urlList: urls
    })
  });
  if (![200, 202].includes(response.status))
    throw new Error(`IndexNow submission failed with HTTP ${response.status}.`);
  return { status: "submitted", httpStatus: response.status, submittedUrls: urls.length };
}

function unavailable(provider: MetricProviderId, reason: string): ProviderResult {
  return {
    provider,
    status: "unavailable",
    collectedAt: new Date().toISOString(),
    metrics: [],
    limitations: [reason]
  };
}

function imported(
  source: ImportedMetricSource,
  metric: string,
  value: number,
  unit: string,
  url?: string,
  dimensions?: Record<string, string>
): ImportedMetric {
  return {
    source,
    metric,
    value,
    unit,
    ...(url ? { url } : {}),
    ...(dimensions && Object.keys(dimensions).length > 0 ? { dimensions } : {})
  };
}

function compactDimensions(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Expected integer ${min}-${max}; received ${value}.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface ImportedMetricSource {
  provider:
    "google-search-console" | "bing-webmaster-tools" | "indexnow" | "ga4" | "plausible" | "matomo" | "other";
  collectedAt: string;
  notes: string;
}

export interface ImportedMetric {
  source: ImportedMetricSource;
  metric: string;
  value: number;
  unit: string;
}

export function labelImportedMetric(metric: ImportedMetric): ImportedMetric {
  return metric;
}

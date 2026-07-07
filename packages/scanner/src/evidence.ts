import type {
  BrowserEvidenceReport,
  EndpointProbe,
  Evidence,
  FieldDataReport,
  PageSnapshot
} from "@seo-polish/schemas";

export function evidenceId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(4, "0")}`;
}

export function endpointEvidence(probe: EndpointProbe, index: number): Evidence {
  const evidence: Evidence = {
    id: evidenceId("endpoint", index),
    type: "http_status",
    url: probe.url,
    value: {
      path: probe.path,
      ok: probe.ok,
      contentType: probe.contentType,
      error: probe.error
    },
    excerpt: probe.bodyExcerpt.slice(0, 500),
    timestamp: new Date().toISOString()
  };
  if (probe.status !== null) {
    evidence.status = probe.status;
  }
  return evidence;
}

export function pageEvidence(page: PageSnapshot, index: number): Evidence[] {
  const base = index * 10;
  return [
    {
      id: evidenceId("page-status", base),
      type: "http_status",
      url: page.finalUrl,
      status: page.status,
      value: { contentType: page.contentType },
      timestamp: new Date().toISOString()
    },
    {
      id: evidenceId("page-title", base + 1),
      type: "html_selector",
      url: page.finalUrl,
      selector: "title",
      value: page.title,
      timestamp: new Date().toISOString()
    },
    {
      id: evidenceId("page-meta", base + 2),
      type: "html_selector",
      url: page.finalUrl,
      selector: "meta[name=description]",
      value: page.metaDescription,
      timestamp: new Date().toISOString()
    },
    {
      id: evidenceId("page-body", base + 3),
      type: "body_excerpt",
      url: page.finalUrl,
      excerpt: page.bodyExcerpt,
      value: { wordCount: page.wordCount },
      timestamp: new Date().toISOString()
    }
  ];
}

export function browserEvidenceEntries(browserEvidence: BrowserEvidenceReport): Evidence[] {
  if (browserEvidence.status !== "ok") {
    return [
      {
        id: "browser-evidence-status",
        type: "browser_runtime",
        value: {
          status: browserEvidence.status,
          requested: browserEvidence.requested,
          limitations: browserEvidence.limitations
        },
        timestamp: browserEvidence.generatedAt
      }
    ];
  }
  return browserEvidence.pages.flatMap((page, index) => [
    {
      id: `browser-runtime-${index}`,
      type: "browser_runtime" as const,
      url: page.finalUrl,
      value: {
        frameworks: page.runtime.frameworks,
        bundlers: page.runtime.bundlers,
        markers: page.runtime.markers,
        rawComparison: page.rawComparison
      },
      timestamp: browserEvidence.generatedAt
    },
    {
      id: `browser-metrics-${index}`,
      type: "browser_metric" as const,
      url: page.finalUrl,
      value: page.metrics,
      timestamp: browserEvidence.generatedAt
    },
    {
      id: `browser-console-${index}`,
      type: "browser_console" as const,
      url: page.finalUrl,
      value: {
        errors: page.console.errors.length,
        warnings: page.console.warnings.length,
        pageErrors: page.pageErrors.length,
        failedRequests: page.failedRequests.length
      },
      timestamp: browserEvidence.generatedAt
    }
  ]);
}

export function fieldDataEvidenceEntries(fieldData: FieldDataReport): Evidence[] {
  const generatedAt = fieldData.generatedAt;
  const entries: Evidence[] = [
    {
      id: "field-data-status",
      type: "field_metric",
      value: {
        status: fieldData.status,
        requested: fieldData.requested,
        providersRequested: fieldData.providersRequested,
        providersAvailable: fieldData.summary.providersAvailable,
        limitations: fieldData.limitations.slice(0, 8)
      },
      timestamp: generatedAt
    }
  ];

  if (fieldData.crux) {
    entries.push({
      id: "field-data-crux-origin",
      type: "field_metric",
      url: fieldData.crux.origin,
      value: {
        status: fieldData.crux.status,
        originP75: fieldData.crux.summary.originP75,
        recordsOk: fieldData.crux.summary.recordsOk,
        recordsNotFound: fieldData.crux.summary.recordsNotFound
      },
      timestamp: generatedAt
    });
  }

  if (fieldData.rum) {
    entries.push({
      id: "field-data-rum-vitals",
      type: "field_metric",
      value: {
        status: fieldData.rum.status,
        p75: fieldData.rum.summary.p75,
        sampleCount: fieldData.rum.summary.sampleCount
      },
      timestamp: generatedAt
    });
  }

  if (fieldData.searchConsole) {
    entries.push({
      id: "search-console-summary",
      type: "search_console",
      value: {
        status: fieldData.searchConsole.status,
        siteUrl: fieldData.searchConsole.siteUrl,
        clicks: fieldData.searchConsole.searchAnalytics.totals.clicks,
        impressions: fieldData.searchConsole.searchAnalytics.totals.impressions,
        inspectedUrls: fieldData.searchConsole.urlInspection.inspected,
        indexedUrls: fieldData.searchConsole.summary.indexedUrls,
        nonIndexedUrls: fieldData.searchConsole.summary.nonIndexedUrls
      },
      timestamp: generatedAt
    });
  }

  return entries;
}

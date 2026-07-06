import type { EndpointProbe, Evidence, PageSnapshot } from "@seo-polish/schemas";

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

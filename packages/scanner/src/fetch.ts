import type { EndpointProbe, ScanConfig } from "@seo-polish/schemas";

export interface FetchUrlResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  contentType: string;
  body: string;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

export async function fetchUrl(
  url: string,
  config: Pick<ScanConfig, "timeoutMs" | "userAgent">,
  accept?: string
): Promise<FetchUrlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "user-agent": config.userAgent
    };
    if (accept) {
      headers.accept = accept;
    }

    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      headers: headersToRecord(response.headers),
      contentType,
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeEndpoint(
  baseUrl: string,
  path: string,
  config: Pick<ScanConfig, "timeoutMs" | "userAgent">,
  accept?: string
): Promise<EndpointProbe> {
  const url = new URL(path, baseUrl).toString();

  try {
    const result = await fetchUrl(url, config, accept);
    return {
      path,
      url,
      status: result.status,
      ok: result.ok,
      contentType: result.contentType || null,
      headers: result.headers,
      bodyExcerpt: result.body.slice(0, 4000)
    };
  } catch (error) {
    return {
      path,
      url,
      status: null,
      ok: false,
      contentType: null,
      headers: {},
      bodyExcerpt: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

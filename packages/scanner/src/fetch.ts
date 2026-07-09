import type { EndpointProbe, FetchTimingSnapshot, RedirectHop, ScanConfig } from "@seo-polish/schemas";
import { isPrivateUrl } from "@seo-polish/security";

export interface FetchUrlResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  contentType: string;
  body: string;
  timing: FetchTimingSnapshot;
  redirectChain: RedirectHop[];
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
  const startedAt = new Date();
  const started = performance.now();

  try {
    const headers: Record<string, string> = {
      "user-agent": config.userAgent
    };
    if (accept) {
      headers.accept = accept;
    }

    const redirectChain: RedirectHop[] = [];
    let currentUrl = url;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
      if (redirectCount > 0 && isPrivateUrl(currentUrl)) {
        throw new Error(`Redirect target is not a safe public URL: ${currentUrl}`);
      }
      response = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: controller.signal
      });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) {
        break;
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push({ url: currentUrl, status: response.status, location: nextUrl });
      if (redirectChain.length >= 10) {
        throw new Error(`Redirect chain exceeds 10 hops for ${url}.`);
      }
      currentUrl = nextUrl;
    }
    if (!response) {
      throw new Error(`No response received for ${url}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const completedAt = new Date();
    const totalMs = Math.max(0, Math.round(performance.now() - started));
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      headers: headersToRecord(response.headers),
      contentType,
      body,
      redirectChain,
      timing: {
        url,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        totalMs,
        bodyBytes: Buffer.byteLength(body, "utf8"),
        contentType: contentType || null,
        run: 1,
        profile: "default"
      }
    };
  } catch (error) {
    const completedAt = new Date();
    const totalMs = Math.max(0, Math.round(performance.now() - started));
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(message), {
      timing: {
        url,
        finalUrl: url,
        status: null,
        ok: false,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        totalMs,
        bodyBytes: 0,
        contentType: null,
        run: 1,
        profile: "default",
        error: message
      } satisfies FetchTimingSnapshot
    });
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
      bodyExcerpt: result.body.slice(0, 4000),
      timing: result.timing,
      redirectChain: result.redirectChain
    };
  } catch (error) {
    const timing = extractTiming(error);
    return {
      path,
      url,
      status: null,
      ok: false,
      contentType: null,
      headers: {},
      bodyExcerpt: "",
      error: error instanceof Error ? error.message : String(error),
      ...(timing ? { timing } : {})
    };
  }
}

function extractTiming(error: unknown): FetchTimingSnapshot | null {
  if (!error || typeof error !== "object" || !("timing" in error)) {
    return null;
  }
  const timing = (error as { timing?: unknown }).timing;
  if (!timing || typeof timing !== "object") {
    return null;
  }
  return timing as FetchTimingSnapshot;
}

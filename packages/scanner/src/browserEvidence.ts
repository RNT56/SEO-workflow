import type {
  BrowserConsoleEntry,
  BrowserEvidenceReport,
  BrowserMetricEvidence,
  BrowserPageEvidence,
  BrowserRequestFailure,
  BrowserResourceTiming,
  BrowserRuntimeEvidence,
  BrowserRenderedSnapshot,
  PageSnapshot,
  ScanConfig
} from "@seo-polish/schemas";
import type { Browser, ConsoleMessage, Page, Request } from "playwright";

const BROWSER_PAGE_LIMIT = 3;
const BROWSER_RESOURCE_LIMIT = 160;
const BROWSER_CONSOLE_LIMIT = 30;
const BROWSER_FAILURE_LIMIT = 30;

export interface CollectBrowserEvidenceInput {
  config: ScanConfig;
  pages: PageSnapshot[];
}

interface BrowserEvaluateResult {
  title: string | null;
  finalUrl: string;
  rendered: BrowserRenderedSnapshot;
  runtime: BrowserRuntimeEvidence;
  metrics: BrowserMetricEvidence;
  resources: BrowserResourceTiming[];
}

export async function collectBrowserEvidence(
  input: CollectBrowserEvidenceInput
): Promise<BrowserEvidenceReport> {
  const requested = browserEvidenceRequested(input.config);
  if (!requested) {
    return emptyBrowserEvidence("disabled", false, ["Browser evidence was not requested for this scan."]);
  }
  if (input.pages.length === 0) {
    return emptyBrowserEvidence("unavailable", true, [
      "No crawled HTML pages were available for browser evidence."
    ]);
  }

  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: input.config.userAgent,
      viewport: { width: 1366, height: 900 }
    });
    const browserPages: BrowserPageEvidence[] = [];
    for (const rawPage of input.pages.slice(0, BROWSER_PAGE_LIMIT)) {
      browserPages.push(await collectPageEvidence(context, rawPage, input.config));
    }
    await context.close();
    return {
      generatedAt: new Date().toISOString(),
      status: "ok",
      requested: true,
      pages: browserPages,
      summary: summarizeBrowserEvidence(browserPages),
      limitations: [
        "Browser evidence is a bounded lab sample, not field data.",
        "INP is not measured unless scripted interactions or field data are available.",
        "Resource timing is reported by the browser and may omit cross-origin transfer sizes without Timing-Allow-Origin."
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unavailable =
      message.includes("Cannot find package 'playwright'") ||
      message.includes("Executable doesn't exist") ||
      message.includes("playwright install");
    return emptyBrowserEvidence(unavailable ? "unavailable" : "failed", true, [
      unavailable
        ? "Playwright or its browser executable is not installed; install browsers or omit --browser-evidence."
        : `Browser evidence collection failed: ${message.slice(0, 240)}`
    ]);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export function browserEvidenceRequested(config: ScanConfig): boolean {
  return config.includeBrowserEvidence || config.includeCoreWebVitals || config.renderJs === "always";
}

async function collectPageEvidence(
  context: Awaited<ReturnType<Browser["newContext"]>>,
  rawPage: PageSnapshot,
  config: ScanConfig
): Promise<BrowserPageEvidence> {
  const page = await context.newPage();
  const consoleEntries: BrowserConsoleEntry[] = [];
  const pageErrors: string[] = [];
  const failedRequests: BrowserRequestFailure[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleEntries.push(consoleEntry(message));
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message.slice(0, 500));
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(requestFailure(request));
  });

  try {
    await page.addInitScript({ content: browserVitalsInitScript() });
    const response = await page.goto(rawPage.finalUrl, {
      waitUntil: "load",
      timeout: config.timeoutMs
    });
    await page.waitForTimeout(500);
    const evaluated = await evaluateBrowserPage(page);
    return {
      url: rawPage.url,
      finalUrl: evaluated.finalUrl,
      status: response?.status() ?? rawPage.status ?? null,
      title: evaluated.title,
      rendered: evaluated.rendered,
      rawComparison: compareRawAndRendered(rawPage, evaluated.rendered),
      console: {
        errors: consoleEntries.filter((entry) => entry.type === "error").slice(0, BROWSER_CONSOLE_LIMIT),
        warnings: consoleEntries.filter((entry) => entry.type === "warning").slice(0, BROWSER_CONSOLE_LIMIT)
      },
      pageErrors: pageErrors.slice(0, BROWSER_CONSOLE_LIMIT),
      failedRequests: failedRequests.slice(0, BROWSER_FAILURE_LIMIT),
      resources: evaluated.resources.slice(0, BROWSER_RESOURCE_LIMIT),
      runtime: evaluated.runtime,
      metrics: evaluated.metrics,
      limitations: pageLimitations(evaluated.metrics)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      url: rawPage.url,
      finalUrl: rawPage.finalUrl,
      status: rawPage.status ?? null,
      title: rawPage.title,
      rendered: renderedFromRaw(rawPage),
      rawComparison: {
        changedFields: [],
        rawWordCount: rawPage.wordCount,
        renderedWordCount: rawPage.wordCount,
        risk: "review_recommended"
      },
      console: {
        errors: consoleEntries.filter((entry) => entry.type === "error").slice(0, BROWSER_CONSOLE_LIMIT),
        warnings: consoleEntries.filter((entry) => entry.type === "warning").slice(0, BROWSER_CONSOLE_LIMIT)
      },
      pageErrors: [message.slice(0, 500), ...pageErrors].slice(0, BROWSER_CONSOLE_LIMIT),
      failedRequests: failedRequests.slice(0, BROWSER_FAILURE_LIMIT),
      resources: [],
      runtime: { frameworks: [], bundlers: [], globals: [], markers: {} },
      metrics: emptyBrowserMetrics(),
      limitations: ["Browser navigation or evaluation failed for this page."]
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function evaluateBrowserPage(page: Page): Promise<BrowserEvaluateResult> {
  return page.evaluate((resourceLimit) => {
    const text = document.body?.innerText ?? "";
    const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
    const metaDescription =
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null;
    const h1 = document.querySelector("h1")?.textContent?.trim() || null;
    const jsonLdTypes = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
    )
      .flatMap((script) => {
        try {
          const parsed = JSON.parse(script.textContent ?? "null") as unknown;
          const nodes = Array.isArray(parsed) ? parsed : [parsed];
          return nodes.flatMap((node) => {
            if (!node || typeof node !== "object") return [];
            const type = (node as { "@type"?: unknown })["@type"];
            return Array.isArray(type) ? type.map(String) : typeof type === "string" ? [type] : [];
          });
        } catch {
          return [];
        }
      })
      .sort();
    const html = document.documentElement.outerHTML.toLowerCase();
    const markers: Record<string, boolean> = {
      svelteKitAssets: html.includes("/_app/immutable"),
      svelteKitPreload: Boolean(
        document.querySelector("[data-sveltekit-preload-data], [data-sveltekit-preload-code]")
      ),
      nextData: Boolean(document.querySelector("#__NEXT_DATA__")),
      nextRoot: Boolean(document.querySelector("#__next")),
      astroIsland: Boolean(document.querySelector("astro-island")),
      nuxtData: Boolean((window as unknown as { __NUXT__?: unknown }).__NUXT__),
      viteModuleGraph:
        html.includes("/@vite/") ||
        Boolean(document.querySelector('script[type="module"], link[rel="modulepreload"]'))
    };
    const frameworks = [
      ...(markers.svelteKitAssets || markers.svelteKitPreload ? ["sveltekit"] : []),
      ...(markers.nextData || markers.nextRoot ? ["nextjs"] : []),
      ...(markers.astroIsland ? ["astro"] : []),
      ...(markers.nuxtData ? ["nuxt"] : [])
    ];
    const bundlers = markers.viteModuleGraph || markers.svelteKitAssets ? ["vite"] : [];
    const knownGlobals = ["__NEXT_DATA__", "__NUXT__", "__SVELTEKIT_APP_VERSION__"].filter(
      (key) => key in window
    );
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint") as PerformancePaintTiming[];
    const vitals = (
      window as unknown as {
        __seoPolishVitals?: {
          lcp: number | null;
          cls: number;
          longTasks: number;
          longTaskTotalMs: number;
        };
      }
    ).__seoPolishVitals;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return {
      title: document.title || null,
      finalUrl: location.href,
      rendered: {
        title: document.title || null,
        metaDescription,
        canonical,
        h1,
        wordCount,
        internalLinks: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((anchor) =>
          anchor.href.startsWith(location.origin)
        ).length,
        jsonLdTypes: Array.from(new Set(jsonLdTypes))
      },
      runtime: {
        frameworks: Array.from(new Set(frameworks)),
        bundlers: Array.from(new Set(bundlers)),
        globals: knownGlobals,
        markers
      },
      metrics: {
        domContentLoadedMs: navigation ? rounded(navigation.domContentLoadedEventEnd) : null,
        loadMs: navigation ? rounded(navigation.loadEventEnd) : null,
        ttfbMs: navigation ? rounded(navigation.responseStart - navigation.requestStart) : null,
        firstContentfulPaintMs: rounded(
          paints.find((paint) => paint.name === "first-contentful-paint")?.startTime ?? null
        ),
        largestContentfulPaintMs: rounded(vitals?.lcp ?? null),
        cumulativeLayoutShift: rounded(vitals?.cls ?? null, 4),
        interactionToNextPaintMs: null,
        longTasks: vitals?.longTasks ?? 0,
        longTaskTotalMs: rounded(vitals?.longTaskTotalMs ?? 0) ?? 0
      },
      resources: resources.slice(0, resourceLimit).map((resource) => ({
        name: resource.name,
        initiatorType: resource.initiatorType,
        startTime: rounded(resource.startTime) ?? 0,
        duration: rounded(resource.duration) ?? 0,
        transferSize: Math.round(resource.transferSize),
        encodedBodySize: Math.round(resource.encodedBodySize),
        decodedBodySize: Math.round(resource.decodedBodySize),
        renderBlockingStatus:
          (resource as PerformanceResourceTiming & { renderBlockingStatus?: string }).renderBlockingStatus ??
          ""
      }))
    };

    function rounded(value: number | null | undefined, digits = 0): number | null {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }
  }, BROWSER_RESOURCE_LIMIT);
}

function browserVitalsInitScript(): string {
  return `
(() => {
  const target = { lcp: null, cls: 0, longTasks: 0, longTaskTotalMs: 0 };
  Object.defineProperty(window, "__seoPolishVitals", { value: target, configurable: true });
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last && typeof last.startTime === "number") target.lcp = last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) target.cls += entry.value || 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        target.longTasks += 1;
        target.longTaskTotalMs += entry.duration || 0;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
})();`;
}

function consoleEntry(message: ConsoleMessage): BrowserConsoleEntry {
  const location = message.location();
  const type = normalizeConsoleType(message.type());
  const entry: BrowserConsoleEntry = {
    type,
    text: message.text().slice(0, 500)
  };
  if (location.url) entry.url = location.url;
  if (typeof location.lineNumber === "number") entry.lineNumber = location.lineNumber;
  if (typeof location.columnNumber === "number") entry.columnNumber = location.columnNumber;
  return entry;
}

function normalizeConsoleType(type: string): BrowserConsoleEntry["type"] {
  if (type === "debug" || type === "info" || type === "log" || type === "warning" || type === "error") {
    return type;
  }
  return type === "warn" ? "warning" : "log";
}

function requestFailure(request: Request): BrowserRequestFailure {
  return {
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    failureText: request.failure()?.errorText ?? "unknown"
  };
}

function compareRawAndRendered(
  raw: PageSnapshot,
  rendered: BrowserRenderedSnapshot
): BrowserPageEvidence["rawComparison"] {
  const changedFields = [
    ...(raw.title !== rendered.title ? ["title"] : []),
    ...(raw.metaDescription !== rendered.metaDescription ? ["metaDescription"] : []),
    ...(raw.canonical !== rendered.canonical ? ["canonical"] : []),
    ...((raw.headings.find((heading) => heading.level === 1)?.text ?? null) !== rendered.h1 ? ["h1"] : []),
    ...(Math.abs(raw.wordCount - rendered.wordCount) > 25 ? ["wordCount"] : [])
  ];
  return {
    changedFields,
    rawWordCount: raw.wordCount,
    renderedWordCount: rendered.wordCount,
    risk: changedFields.length > 0 ? "review_recommended" : "low"
  };
}

function renderedFromRaw(raw: PageSnapshot): BrowserRenderedSnapshot {
  return {
    title: raw.title,
    metaDescription: raw.metaDescription,
    canonical: raw.canonical,
    h1: raw.headings.find((heading) => heading.level === 1)?.text ?? null,
    wordCount: raw.wordCount,
    internalLinks: raw.internalLinks.length,
    jsonLdTypes: [...new Set(raw.jsonLd.flatMap((item) => item.types))]
  };
}

function emptyBrowserMetrics(): BrowserMetricEvidence {
  return {
    domContentLoadedMs: null,
    loadMs: null,
    ttfbMs: null,
    firstContentfulPaintMs: null,
    largestContentfulPaintMs: null,
    cumulativeLayoutShift: null,
    interactionToNextPaintMs: null,
    longTasks: 0,
    longTaskTotalMs: 0
  };
}

function pageLimitations(metrics: BrowserMetricEvidence): string[] {
  return [
    ...(metrics.largestContentfulPaintMs === null
      ? ["LCP was not emitted for this bounded lab page load."]
      : []),
    "INP is not measured without scripted interaction or field data."
  ];
}

function summarizeBrowserEvidence(pages: BrowserPageEvidence[]): BrowserEvidenceReport["summary"] {
  return {
    pagesVisited: pages.length,
    consoleErrors: pages.reduce((sum, page) => sum + page.console.errors.length, 0),
    consoleWarnings: pages.reduce((sum, page) => sum + page.console.warnings.length, 0),
    pageErrors: pages.reduce((sum, page) => sum + page.pageErrors.length, 0),
    failedRequests: pages.reduce((sum, page) => sum + page.failedRequests.length, 0),
    browserMetricCoverage: {
      ttfb: pages.filter((page) => page.metrics.ttfbMs !== null).length,
      fcp: pages.filter((page) => page.metrics.firstContentfulPaintMs !== null).length,
      lcp: pages.filter((page) => page.metrics.largestContentfulPaintMs !== null).length,
      cls: pages.filter((page) => page.metrics.cumulativeLayoutShift !== null).length,
      inp: pages.filter((page) => page.metrics.interactionToNextPaintMs !== null).length
    },
    detectedFrameworks: uniqueSorted(pages.flatMap((page) => page.runtime.frameworks)),
    detectedBundlers: uniqueSorted(pages.flatMap((page) => page.runtime.bundlers)),
    hydrationRiskUrls: pages
      .filter((page) => page.rawComparison.risk === "review_recommended")
      .map((page) => page.finalUrl)
  };
}

function emptyBrowserEvidence(
  status: BrowserEvidenceReport["status"],
  requested: boolean,
  limitations: string[]
): BrowserEvidenceReport {
  return {
    generatedAt: new Date().toISOString(),
    status,
    requested,
    pages: [],
    summary: {
      pagesVisited: 0,
      consoleErrors: 0,
      consoleWarnings: 0,
      pageErrors: 0,
      failedRequests: 0,
      browserMetricCoverage: { ttfb: 0, fcp: 0, lcp: 0, cls: 0, inp: 0 },
      detectedFrameworks: [],
      detectedBundlers: [],
      hydrationRiskUrls: []
    },
    limitations
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

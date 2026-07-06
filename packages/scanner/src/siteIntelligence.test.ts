import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { PageSnapshot, ScanConfig } from "@seo-polish/schemas";
import { buildPerformanceAudit } from "./performance.js";
import { analyzeRepository } from "./repo.js";
import { discoverResources } from "./resourceDiscovery.js";
import { clusterRouteTemplates } from "./routeTemplates.js";
import { inferTechStack } from "./techStack.js";

describe("site intelligence", () => {
  it("discovers resources with blocking and third-party signals", () => {
    const resources = discoverResources(
      `<html><head>
        <link rel="stylesheet" href="/app.css">
        <script src="/app.js"></script>
        <script async src="https://cdn.example.com/analytics.js"></script>
      </head><body><img src="/hero.webp" loading="lazy"></body></html>`,
      "https://example.com/"
    );

    expect(resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://example.com/app.css",
          type: "stylesheet",
          renderBlocking: true
        }),
        expect.objectContaining({ url: "https://example.com/app.js", type: "script", renderBlocking: true }),
        expect.objectContaining({
          url: "https://cdn.example.com/analytics.js",
          thirdParty: true,
          async: true
        }),
        expect.objectContaining({ url: "https://example.com/hero.webp", type: "image", lazy: true })
      ])
    );
  });

  it("analyzes repo paths without reading source bodies", async () => {
    const root = join(tmpdir(), `seo-polish-repo-${Date.now()}`);
    await mkdir(join(root, "src", "app"), { recursive: true });
    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { next: "1.0.0", react: "1.0.0" }, scripts: { build: "next build" } }),
      "utf8"
    );
    await writeFile(join(root, "next.config.js"), "module.exports = {}", "utf8");
    await writeFile(join(root, "src", "app", "layout.tsx"), "export default function Layout() {}", "utf8");
    await writeFile(join(root, "public", "robots.txt"), "User-agent: *", "utf8");

    const analysis = await analyzeRepository({ repoPath: root });

    expect(analysis.status).toBe("ok");
    expect(analysis.frameworks).toContain("nextjs");
    expect(analysis.sourceFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining(["package.json", "next.config.js", "src/app/layout.tsx", "public/robots.txt"])
    );
  });

  it("clusters route templates and maps source candidates", () => {
    const repo = {
      generatedAt: new Date().toISOString(),
      status: "ok" as const,
      frameworks: ["nextjs"],
      dependencies: [],
      scripts: [],
      sourceFiles: [],
      routeFiles: [
        { path: "src/app/projects/[slug]/page.tsx", kind: "route" as const, confidence: 90, reason: "route" }
      ],
      staticFiles: [],
      deploymentFiles: [],
      seoFiles: [],
      confidence: 90,
      limitations: []
    };
    const clusters = clusterRouteTemplates(
      [
        page("https://example.com/projects/alpha"),
        page("https://example.com/projects/beta"),
        page("https://example.com/")
      ],
      repo
    );

    expect(clusters[0]).toEqual(
      expect.objectContaining({
        urlPattern: "/projects/:slug",
        pageCount: 2,
        sourceCandidates: ["src/app/projects/[slug]/page.tsx"]
      })
    );
  });

  it("fingerprints stack from headers, assets and repo signals", () => {
    const resources = discoverResources(
      `<script src="/_next/static/app.js"></script><script src="https://www.googletagmanager.com/gtm.js"></script>`,
      "https://example.com/"
    );
    const fingerprint = inferTechStack({
      framework: "nextjs",
      pages: [
        {
          ...page("https://example.com/"),
          headers: { server: "Netlify", "x-nf-request-id": "abc" }
        }
      ],
      endpoints: {},
      resources,
      repo: {
        generatedAt: new Date().toISOString(),
        status: "ok",
        frameworks: ["nextjs"],
        dependencies: ["next", "@netlify/plugin-nextjs"],
        scripts: [],
        sourceFiles: [],
        routeFiles: [],
        staticFiles: [],
        deploymentFiles: [{ path: "netlify.toml", kind: "deployment", confidence: 95, reason: "hosting" }],
        seoFiles: [],
        confidence: 90,
        limitations: []
      }
    });

    expect(fingerprint.framework).toBe("nextjs");
    expect(fingerprint.hosting).toContain("netlify");
    expect(fingerprint.analytics).toContain("google-tag-manager");
  });

  it("prefers structural SvelteKit assets over prose mentions of Next.js", () => {
    const resources = discoverResources(
      `<script type="module" src="/_app/immutable/chunks/app.js"></script>
       <link rel="stylesheet" href="/_app/immutable/assets/app.css">`,
      "https://example.com/"
    );
    const fingerprint = inferTechStack({
      framework: "unknown",
      pages: [
        {
          ...page("https://example.com/"),
          bodyExcerpt:
            "Case study copy mentions Next.js API routes as an integration option, but this page is served by SvelteKit assets."
        }
      ],
      endpoints: {},
      resources,
      repo: {
        generatedAt: new Date().toISOString(),
        status: "not_configured",
        frameworks: [],
        dependencies: [],
        scripts: [],
        sourceFiles: [],
        routeFiles: [],
        staticFiles: [],
        deploymentFiles: [],
        seoFiles: [],
        confidence: 0,
        limitations: []
      }
    });

    expect(fingerprint.framework).toBe("sveltekit");
    expect(fingerprint.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "framework", name: "nextjs", source: "html", confidence: 48 }),
        expect.objectContaining({ category: "framework", name: "sveltekit", source: "asset_path" })
      ])
    );
  });

  it("builds HTTP fallback performance metrics without browser-only claims", async () => {
    const config = scanConfig();
    const performance = await buildPerformanceAudit({
      config,
      origin: "https://example.com",
      pages: [
        {
          ...page("https://example.com/"),
          timing: {
            url: "https://example.com/",
            finalUrl: "https://example.com/",
            status: 200,
            ok: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            totalMs: 150,
            bodyBytes: 1000,
            contentType: "text/html",
            run: 1,
            profile: "default"
          }
        }
      ],
      endpoints: {},
      pageHtml: new Map([["https://example.com/", "<html><head></head><body>Hello</body></html>"]])
    });

    expect(performance.summary.medianDocumentFetchMs).toBe(150);
    expect(performance.metrics.find((metric) => metric.id === "lcp-ms")).toEqual(
      expect.objectContaining({ value: null, status: "not_measured", reliability: "not_measured" })
    );
  });
});

function page(url: string): PageSnapshot {
  return {
    url,
    status: 200,
    finalUrl: url,
    contentType: "text/html",
    headers: {},
    title: "Example Page",
    metaDescription: "Example description",
    robotsMeta: null,
    canonical: url,
    hreflang: [],
    lang: "en",
    viewport: "width=device-width, initial-scale=1",
    headings: [{ level: 1, text: "Example Page" }],
    wordCount: 2,
    internalLinks: [],
    externalLinks: [],
    images: [],
    jsonLd: [],
    openGraph: {},
    twitterCards: {},
    hasSkipLink: false,
    forms: 0,
    bodyExcerpt: "Example Page"
  };
}

function scanConfig(): ScanConfig {
  return {
    url: "https://example.com/",
    siteType: "auto",
    maxPages: 5,
    maxDepth: 1,
    renderJs: "never",
    respectRobotsTxt: true,
    userAgent: "test",
    timeoutMs: 100,
    concurrency: 1,
    includeScreenshots: false,
    includeCoreWebVitals: false,
    includeAccessibility: true,
    includeCommerce: true,
    includeInternationalSeo: true,
    includeLocalSeo: true,
    includeExperimentalStandards: true,
    includeAgentReadiness: true,
    includeSearchIntegrations: false,
    outputDir: "report",
    performanceRuns: 1,
    performanceBudgets: { documentFetchMs: 200, totalRequests: 10 },
    policy: {
      search: "yes",
      aiInput: "ask",
      aiTrain: "ask",
      mcpMutations: "disabled",
      commerceActions: "disabled"
    }
  };
}

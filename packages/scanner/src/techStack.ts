import type {
  EndpointProbe,
  PageSnapshot,
  RepoAnalysis,
  ResourceTimingSnapshot,
  TechStackFingerprint,
  TechStackSignal
} from "@seo-polish/schemas";

export interface InferTechStackInput {
  framework: string;
  pages: PageSnapshot[];
  endpoints: Record<string, EndpointProbe>;
  resources: ResourceTimingSnapshot[];
  repo?: RepoAnalysis;
}

export function inferTechStack(input: InferTechStackInput): TechStackFingerprint {
  const signals: TechStackSignal[] = [];
  const add = (signal: TechStackSignal): void => {
    if (
      !signals.some(
        (item) =>
          item.category === signal.category && item.name === signal.name && item.evidence === signal.evidence
      )
    ) {
      signals.push(signal);
    }
  };

  for (const page of input.pages) {
    const headerText = Object.entries(page.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n")
      .toLowerCase();
    const excerpt = page.bodyExcerpt.toLowerCase();
    const resourceText = input.resources
      .filter((resource) => resource.url.startsWith(new URL(page.finalUrl).origin))
      .map((resource) => resource.url)
      .join("\n")
      .toLowerCase();
    detectFromText(headerText, "headers", add);
    detectFromText(`${excerpt}\n${resourceText}`, "html", add);
  }

  for (const endpoint of Object.values(input.endpoints)) {
    const text = `${Object.entries(endpoint.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n")}\n${endpoint.bodyExcerpt}`.toLowerCase();
    detectFromText(text, "endpoint", add);
  }

  for (const resource of input.resources) {
    detectFromText(resource.url.toLowerCase(), "asset_path", add);
  }

  if (input.framework !== "unknown") {
    add({
      category: "framework",
      name: input.framework,
      confidence: 75,
      source: "inference",
      evidence: "Framework classifier matched crawl headers or HTML."
    });
  }

  if (input.repo?.status === "ok") {
    for (const framework of input.repo.frameworks) {
      add({
        category: "framework",
        name: framework,
        confidence: 92,
        source: "repo",
        evidence: "Framework dependency or config file detected in source repo."
      });
    }
    for (const dep of input.repo.dependencies) {
      detectDependency(dep, add);
    }
    for (const file of input.repo.deploymentFiles) {
      if (file.path === "netlify.toml") {
        add({ category: "hosting", name: "netlify", confidence: 95, source: "repo", evidence: file.path });
      }
      if (file.path === "vercel.json") {
        add({ category: "hosting", name: "vercel", confidence: 95, source: "repo", evidence: file.path });
      }
    }
  }

  const framework = topAggregatedSignal(signals, "framework")?.name ?? input.framework;
  return {
    generatedAt: new Date().toISOString(),
    framework,
    hosting: uniqueNames(signals, "hosting"),
    cdn: uniqueNames(signals, "cdn"),
    cms: uniqueNames(signals, "cms"),
    analytics: uniqueNames(signals, "analytics"),
    bundler: uniqueNames(signals, "bundler"),
    rendering: uniqueNames(signals, "rendering"),
    imagePipeline: uniqueNames(signals, "image"),
    signals: signals.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name)),
    confidence: Math.max(0, Math.min(99, Math.round(average(signals.map((signal) => signal.confidence)))))
  };
}

function detectFromText(
  text: string,
  source: TechStackSignal["source"],
  add: (signal: TechStackSignal) => void
): void {
  const matchers: Array<[RegExp, TechStackSignal["category"], string, number]> = [
    [/\/_next\/|__next_data__|x-nextjs|next-router-state-tree/, "framework", "nextjs", 93],
    [/\bnext\.js\b/i, "framework", "nextjs", 48],
    [/astro-island|astro\.assets|\/_astro\//, "framework", "astro", 92],
    [/\/_nuxt\/|__nuxt|nuxt/i, "framework", "nuxt", 90],
    [/\/_app\/immutable|data-sveltekit/i, "framework", "sveltekit", 94],
    [/sveltekit|svelte-kit/i, "framework", "sveltekit", 62],
    [/___gatsby|gatsby/i, "framework", "gatsby", 90],
    [/docusaurus/i, "framework", "docusaurus", 88],
    [/wp-content|wp-includes|wordpress/i, "cms", "wordpress", 94],
    [/shopify|cdn\.shopify/i, "cms", "shopify", 92],
    [/webflow|wf-page/i, "cms", "webflow", 88],
    [/server:\s*netlify|x-nf-|netlify/i, "hosting", "netlify", 92],
    [/x-vercel|server:\s*vercel|vercel/i, "hosting", "vercel", 92],
    [/cf-cache-status|server:\s*cloudflare|cloudflare/i, "cdn", "cloudflare", 90],
    [/fastly|x-served-by/i, "cdn", "fastly", 84],
    [/googletagmanager|gtm\.js/i, "analytics", "google-tag-manager", 88],
    [/google-analytics|gtag\(/i, "analytics", "google-analytics", 86],
    [/plausible\.io/i, "analytics", "plausible", 86],
    [/posthog/i, "analytics", "posthog", 84],
    [/\/assets\/.*\.(js|css)|type="module"|vite/i, "bundler", "vite", 70],
    [/\/_next\/image|\?url=.*image/i, "image", "next-image", 78],
    [/server-rendered|__next_data__|window\.__nuxt__/i, "rendering", "hybrid-rendering", 76]
  ];

  for (const [pattern, category, name, confidence] of matchers) {
    if (pattern.test(text)) {
      add({
        category,
        name,
        confidence,
        source,
        evidence: evidenceExcerpt(text, pattern)
      });
    }
  }
}

function detectDependency(dep: string, add: (signal: TechStackSignal) => void): void {
  const dependencySignals: Record<string, [TechStackSignal["category"], string, number]> = {
    next: ["framework", "nextjs", 95],
    astro: ["framework", "astro", 95],
    nuxt: ["framework", "nuxt", 95],
    "@sveltejs/kit": ["framework", "sveltekit", 95],
    "@remix-run/react": ["framework", "remix", 90],
    "@docusaurus/core": ["framework", "docusaurus", 95],
    vite: ["bundler", "vite", 90],
    "@vercel/analytics": ["analytics", "vercel-analytics", 86],
    "@netlify/plugin-nextjs": ["hosting", "netlify", 86],
    sharp: ["image", "sharp", 82],
    "next-sitemap": ["sitemap", "next-sitemap", 84]
  };
  const signal = dependencySignals[dep];
  if (!signal) {
    return;
  }
  add({
    category: signal[0],
    name: signal[1],
    confidence: signal[2],
    source: "repo",
    evidence: `Dependency: ${dep}`
  });
}

function uniqueNames(signals: TechStackSignal[], category: TechStackSignal["category"]): string[] {
  return [...new Set(signals.filter((signal) => signal.category === category).map((signal) => signal.name))];
}

function topAggregatedSignal(
  signals: TechStackSignal[],
  category: TechStackSignal["category"]
): TechStackSignal | undefined {
  const candidates = signals.filter((signal) => signal.category === category);
  const scores = new Map<
    string,
    { name: string; score: number; maxConfidence: number; signals: TechStackSignal[] }
  >();
  for (const signal of candidates) {
    const current = scores.get(signal.name) ?? {
      name: signal.name,
      score: 0,
      maxConfidence: 0,
      signals: []
    };
    current.signals.push(signal);
    current.maxConfidence = Math.max(current.maxConfidence, signal.confidence);
    current.score = aggregatedSignalScore(current.signals);
    scores.set(signal.name, current);
  }

  const winner = [...scores.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.maxConfidence - a.maxConfidence ||
      b.signals.length - a.signals.length ||
      a.name.localeCompare(b.name)
  )[0];
  if (!winner) {
    return undefined;
  }

  return winner.signals.sort((a, b) => b.confidence - a.confidence || a.source.localeCompare(b.source))[0];
}

function aggregatedSignalScore(signals: TechStackSignal[]): number {
  const maxConfidence = Math.max(...signals.map((signal) => signal.confidence));
  const maxSourceWeight = Math.max(...signals.map(sourceWeight));
  const structuralSignals = signals.filter((signal) =>
    ["repo", "asset_path", "headers", "endpoint"].includes(signal.source)
  ).length;
  const sourceDiversity = new Set(signals.map((signal) => signal.source)).size;
  return (
    maxConfidence + maxSourceWeight + Math.min(24, structuralSignals * 4) + Math.min(8, sourceDiversity * 2)
  );
}

function sourceWeight(signal: TechStackSignal): number {
  const sourceWeights: Record<TechStackSignal["source"], number> = {
    repo: 40,
    asset_path: 18,
    headers: 12,
    endpoint: 8,
    inference: 6,
    dns: 5,
    html: 0
  };
  return sourceWeights[signal.source];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evidenceExcerpt(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match || match.index < 0) {
    return "Pattern matched crawl evidence.";
  }
  return text
    .slice(Math.max(0, match.index - 24), Math.min(text.length, match.index + 96))
    .replace(/\s+/g, " ");
}

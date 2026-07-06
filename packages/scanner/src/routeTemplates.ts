import type { PageSnapshot, RepoAnalysis, RouteTemplateCluster } from "@seo-polish/schemas";

export function clusterRouteTemplates(pages: PageSnapshot[], repo?: RepoAnalysis): RouteTemplateCluster[] {
  const groups = new Map<string, PageSnapshot[]>();
  for (const page of pages) {
    const key = routePattern(page.finalUrl);
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }

  return [...groups.entries()]
    .map(([pattern, group], index) => {
      const representative = group[0];
      const signals = buildSignals(group);
      const sourceCandidates = sourceCandidatesForPattern(pattern, repo);
      return {
        id: `template-${index + 1}`,
        label: labelForPattern(pattern),
        urlPattern: pattern,
        representativeUrl: representative?.finalUrl ?? "",
        urls: group.map((page) => page.finalUrl),
        pageCount: group.length,
        signals,
        sourceCandidates
      };
    })
    .sort((a, b) => b.pageCount - a.pageCount || a.urlPattern.localeCompare(b.urlPattern));
}

function routePattern(input: string): string {
  const url = new URL(input);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }
  return `/${segments.map((segment, index) => normalizeSegment(segment, index > 0)).join("/")}`;
}

function normalizeSegment(segment: string, preferDynamic = false): string {
  const decoded = decodeURIComponent(segment).toLowerCase();
  if (/^\d+$/.test(decoded)) {
    return ":number";
  }
  if (/^[0-9a-f]{8,}$/i.test(decoded)) {
    return ":id";
  }
  if (preferDynamic && !isStaticSegment(decoded)) {
    return ":slug";
  }
  if (decoded.length > 32 || decoded.includes("-")) {
    return ":slug";
  }
  return decoded;
}

function isStaticSegment(segment: string): boolean {
  return [
    "about",
    "contact",
    "privacy",
    "terms",
    "legal",
    "pricing",
    "docs",
    "blog",
    "projects",
    "services",
    "products"
  ].includes(segment);
}

function labelForPattern(pattern: string): string {
  if (pattern === "/") {
    return "Home template";
  }
  const first = pattern.split("/").filter(Boolean)[0] ?? "page";
  const normalized = first.replace(/[:_-]+/g, " ");
  return `${titleCase(normalized)} template`;
}

function buildSignals(pages: PageSnapshot[]): string[] {
  const titleShapes = new Set(pages.map((page) => shapeText(page.title ?? "")));
  const h1Shapes = new Set(
    pages.map((page) => shapeText(page.headings.find((heading) => heading.level === 1)?.text ?? ""))
  );
  const jsonLdTypes = new Set(pages.flatMap((page) => page.jsonLd.flatMap((item) => item.types)));
  return [
    `${pages.length} crawled URL${pages.length === 1 ? "" : "s"}`,
    `title-shapes:${Math.max(1, titleShapes.size)}`,
    `h1-shapes:${Math.max(1, h1Shapes.size)}`,
    `jsonld:${jsonLdTypes.size > 0 ? [...jsonLdTypes].join("|") : "none"}`
  ];
}

function sourceCandidatesForPattern(pattern: string, repo?: RepoAnalysis): string[] {
  if (!repo || repo.status !== "ok") {
    return [];
  }
  const firstSegment = pattern.split("/").filter(Boolean)[0]?.replace(/^:/, "") ?? "";
  const candidates = repo.routeFiles
    .filter((file) => {
      const lower = file.path.toLowerCase();
      if (pattern === "/") {
        return /(^|\/)(index|page)\.[cm]?[jt]sx?$|(^|\/)\+page\.svelte$|(^|\/)index\.astro$/.test(lower);
      }
      return firstSegment ? lower.includes(firstSegment) : false;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((file) => file.path);
  if (candidates.length > 0) {
    return candidates;
  }
  return repo.routeFiles.slice(0, 5).map((file) => file.path);
}

function shapeText(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    return "empty";
  }
  return normalized
    .replace(/[A-Z][a-z]+/g, "Word")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function titleCase(input: string): string {
  return input.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

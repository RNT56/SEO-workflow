import type { PageSnapshot, SiteType } from "@seo-polish/schemas";

export function classifySite(url: string, pages: PageSnapshot[]): SiteType {
  const combined =
    `${url}\n${pages.map((page) => `${page.finalUrl}\n${page.bodyExcerpt}\n${page.jsonLd.flatMap((item) => item.types).join(" ")}`).join("\n")}`.toLowerCase();

  if (/openapi|swagger|api reference|developer api|\/api\b/.test(combined)) {
    return "api";
  }
  if (/\/docs|documentation|guides|get started|reference/.test(combined)) {
    return "docs";
  }
  if (/cart|checkout|product|price|sku|offer|shopify/.test(combined)) {
    return "commerce";
  }
  if (/localbusiness|opening hours|address|phone|map/.test(combined)) {
    return "local-business";
  }
  if (/article|newsarticle|publisher|rss|atom/.test(combined)) {
    return "publisher";
  }
  if (/login|dashboard|app\./.test(combined)) {
    return "app";
  }
  return "content";
}

export function detectFramework(headers: Record<string, string>, html: string): string {
  const haystack = `${Object.entries(headers)
    .map(([key, value]) => `${key}:${value}`)
    .join("\n")}\n${html}`.toLowerCase();

  if (
    haystack.includes("/_next/") ||
    haystack.includes("__next_data__") ||
    haystack.includes("x-nextjs") ||
    haystack.includes("next-router-state-tree")
  )
    return "nextjs";
  if (haystack.includes("astro")) return "astro";
  if (haystack.includes("__nuxt")) return "nuxt";
  if (
    haystack.includes("/_app/immutable") ||
    haystack.includes("data-sveltekit") ||
    haystack.includes("sveltekit")
  )
    return "sveltekit";
  if (haystack.includes("docusaurus")) return "docusaurus";
  if (haystack.includes("wp-content")) return "wordpress";
  if (haystack.includes("shopify")) return "shopify";
  if (haystack.includes("webflow")) return "webflow";
  return "unknown";
}

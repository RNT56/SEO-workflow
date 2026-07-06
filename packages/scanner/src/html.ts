import type { HeadingSnapshot, ImageSnapshot, JsonLdSnapshot, PageSnapshot } from "@seo-polish/schemas";
import { stripInstructionalControlText } from "@seo-polish/security";
import { normalizeUrl, sameOrigin } from "./url.js";

export interface ExtractHtmlInput {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
  html: string;
}

export function extractHtmlSnapshot(input: ExtractHtmlInput): PageSnapshot {
  const cleanText = htmlToText(input.html);
  const links = extractLinks(input.html, input.finalUrl);
  const origin = new URL(input.finalUrl).origin;
  const internalLinks = links.filter((url) => sameOrigin(url, origin));
  const externalLinks = links.filter((url) => !sameOrigin(url, origin));

  return {
    url: input.url,
    status: input.status,
    finalUrl: input.finalUrl,
    contentType: input.contentType,
    headers: input.headers,
    title: firstMatch(input.html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: extractMeta(input.html, "description"),
    robotsMeta: extractMeta(input.html, "robots"),
    canonical: extractLinkRel(input.html, "canonical", input.finalUrl),
    hreflang: extractHreflang(input.html, input.finalUrl),
    lang: firstMatch(input.html, /<html[^>]*\slang=["']?([^"'\s>]+)/i),
    viewport: extractMeta(input.html, "viewport"),
    headings: extractHeadings(input.html),
    wordCount: cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0,
    internalLinks,
    externalLinks,
    images: extractImages(input.html, input.finalUrl),
    jsonLd: extractJsonLd(input.html),
    openGraph: extractPropertyMeta(input.html, "og:"),
    twitterCards: extractNamePrefixMeta(input.html, "twitter:"),
    hasSkipLink: /href=["']#(?:main|content|main-content)["']/i.test(input.html),
    forms: [...input.html.matchAll(/<form\b/gi)].length,
    bodyExcerpt: cleanText.slice(0, 1200)
  };
}

export function htmlToText(html: string): string {
  const withoutScripts = stripInstructionalControlText(html);
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  const value = match?.[1]?.trim();
  return value ? decodeHtml(value) : null;
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapeRegExp(name)}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const value = firstMatch(html, pattern);
    if (value) {
      return value;
    }
  }
  return null;
}

function extractPropertyMeta(html: string, prefix: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /<meta[^>]+property=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (key.startsWith(prefix)) {
      values[key] = decodeHtml(value);
    }
  }
  return values;
}

function extractNamePrefixMeta(html: string, prefix: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /<meta[^>]+name=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (key.startsWith(prefix)) {
      values[key] = decodeHtml(value);
    }
  }
  return values;
}

function extractLinkRel(html: string, rel: string, baseUrl: string): string | null {
  const pattern = new RegExp(
    `<link[^>]+rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const value = firstMatch(html, pattern);
  return value ? normalizeUrl(value, baseUrl) : null;
}

function extractHreflang(html: string, baseUrl: string): string[] {
  const values: string[] = [];
  const pattern =
    /<link[^>]+rel=["'][^"']*alternate[^"']*["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[2];
    if (href) {
      values.push(normalizeUrl(href, baseUrl));
    }
  }
  return values;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1];
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      urls.push(normalizeUrl(href, baseUrl));
    } catch {
      // Ignore malformed links; rules can reason over extracted valid links only.
    }
  }
  return [...new Set(urls)];
}

function extractHeadings(html: string): HeadingSnapshot[] {
  const headings: HeadingSnapshot[] = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of html.matchAll(pattern)) {
    const level = Number(match[1]);
    const text = htmlToText(match[2] ?? "");
    if (level >= 1 && level <= 6 && text) {
      headings.push({ level, text });
    }
  }
  return headings;
}

function extractImages(html: string, baseUrl: string): ImageSnapshot[] {
  const images: ImageSnapshot[] = [];
  const pattern = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1] ?? "";
    const src = attr(attrs, "src");
    if (!src) {
      continue;
    }
    images.push({
      src: normalizeUrl(src, baseUrl),
      alt: attr(attrs, "alt"),
      hasWidth: attr(attrs, "width") !== null,
      hasHeight: attr(attrs, "height") !== null
    });
  }
  return images;
}

function extractJsonLd(html: string): JsonLdSnapshot[] {
  const scripts: JsonLdSnapshot[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = (match[1] ?? "").trim();
    try {
      const parsed: unknown = JSON.parse(raw);
      scripts.push({
        raw,
        parsed,
        parseError: null,
        types: collectJsonLdTypes(parsed)
      });
    } catch (error) {
      scripts.push({
        raw,
        parsed: null,
        parseError: error instanceof Error ? error.message : String(error),
        types: []
      });
    }
  }
  return scripts;
}

function collectJsonLdTypes(value: unknown): string[] {
  const types = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    const typeValue = record["@type"];
    if (typeof typeValue === "string") {
      types.add(typeValue);
    } else if (Array.isArray(typeValue)) {
      typeValue
        .filter((entry): entry is string => typeof entry === "string")
        .forEach((entry) => types.add(entry));
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...types];
}

function attr(attrs: string, name: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "i");
  const value = attrs.match(pattern)?.[1];
  return value !== undefined ? decodeHtml(value) : null;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

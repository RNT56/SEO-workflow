import type { ResourceTimingSnapshot } from "@seo-polish/schemas";
import { normalizeUrl } from "./url.js";

export function discoverResources(html: string, baseUrl: string): ResourceTimingSnapshot[] {
  const resources = new Map<string, ResourceTimingSnapshot>();
  const lower = html.toLowerCase();
  const headEnd = lower.indexOf("</head>");
  const tagPattern = /<\s*(script|link|img|source)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html))) {
    const tagName = (match[1] ?? "").toLowerCase();
    const attrs = parseAttributes(match[2] ?? "");
    const discoveredIn = headEnd >= 0 && match.index < headEnd ? "head" : "body";
    for (const candidate of resourceCandidates(tagName, attrs, baseUrl)) {
      const existing = resources.get(candidate.url);
      if (existing) {
        resources.set(candidate.url, {
          ...existing,
          renderBlocking: existing.renderBlocking || candidate.renderBlocking,
          async: existing.async || candidate.async,
          defer: existing.defer || candidate.defer,
          lazy: existing.lazy || candidate.lazy
        });
      } else {
        resources.set(candidate.url, {
          ...candidate,
          discoveredIn
        });
      }
    }
  }

  return [...resources.values()];
}

function resourceCandidates(
  tagName: string,
  attrs: Map<string, string>,
  baseUrl: string
): Array<Omit<ResourceTimingSnapshot, "discoveredIn">> {
  const origin = new URL(baseUrl).origin;
  const rel = attrs.get("rel")?.toLowerCase() ?? "";
  const href = attrs.get("href");
  const src = attrs.get("src");
  const srcset = attrs.get("srcset");
  const asyncAttr = attrs.has("async");
  const deferAttr = attrs.has("defer");
  const lazy = attrs.get("loading")?.toLowerCase() === "lazy";
  const candidates: Array<Omit<ResourceTimingSnapshot, "discoveredIn">> = [];

  if (tagName === "script" && src) {
    const url = normalizeResourceUrl(src, baseUrl);
    if (url) {
      candidates.push(
        baseResource(url, origin, "script", !asyncAttr && !deferAttr, asyncAttr, deferAttr, lazy)
      );
    }
  }

  if (tagName === "link" && href) {
    const url = normalizeResourceUrl(href, baseUrl);
    if (url) {
      if (rel.includes("stylesheet")) {
        candidates.push(baseResource(url, origin, "stylesheet", true, false, false, false));
      } else if (rel.includes("preload") || rel.includes("modulepreload")) {
        candidates.push(
          baseResource(url, origin, resourceTypeFromUrl(url, "preload"), false, false, false, false)
        );
      } else if (rel.includes("icon")) {
        candidates.push(baseResource(url, origin, "image", false, false, false, false));
      }
    }
  }

  if ((tagName === "img" || tagName === "source") && src) {
    const url = normalizeResourceUrl(src, baseUrl);
    if (url) {
      candidates.push(baseResource(url, origin, "image", false, false, false, lazy));
    }
  }

  if ((tagName === "img" || tagName === "source") && srcset) {
    for (const value of parseSrcset(srcset).slice(0, 3)) {
      const url = normalizeResourceUrl(value, baseUrl);
      if (url) {
        candidates.push(baseResource(url, origin, "image", false, false, false, lazy));
      }
    }
  }

  return candidates;
}

function baseResource(
  url: string,
  origin: string,
  type: ResourceTimingSnapshot["type"],
  renderBlocking: boolean,
  asyncAttr: boolean,
  deferAttr: boolean,
  lazy: boolean
): Omit<ResourceTimingSnapshot, "discoveredIn"> {
  const sameOrigin = new URL(url).origin === origin;
  return {
    url,
    type,
    sameOrigin,
    thirdParty: !sameOrigin,
    renderBlocking,
    async: asyncAttr,
    defer: deferAttr,
    lazy
  };
}

function resourceTypeFromUrl(
  url: string,
  fallback: ResourceTimingSnapshot["type"]
): ResourceTimingSnapshot["type"] {
  const pathname = new URL(url).pathname.toLowerCase();
  if (/\.(woff2?|ttf|otf|eot)$/.test(pathname)) return "font";
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/.test(pathname)) return "image";
  if (/\.(m?js|jsx|ts|tsx)$/.test(pathname)) return "script";
  if (/\.css$/.test(pathname)) return "stylesheet";
  return fallback;
}

function normalizeResourceUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(data|javascript|mailto|tel):/i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return normalizeUrl(trimmed, baseUrl);
  } catch {
    return null;
  }
}

function parseSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter((item): item is string => Boolean(item));
}

function parseAttributes(attrsText: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attrsText))) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) {
      continue;
    }
    attrs.set(name, decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attrs;
}

function decodeHtml(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

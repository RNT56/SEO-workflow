export interface SitemapParseResult {
  urls: string[];
  validXml: boolean;
  errors: string[];
}

export function parseSitemapXml(body: string): SitemapParseResult {
  const errors: string[] = [];
  const trimmed = body.trim();

  if (!trimmed.startsWith("<")) {
    errors.push("Sitemap response is not XML.");
  }

  const hasSitemapRoot = /<(urlset|sitemapindex)\b/i.test(trimmed);
  if (trimmed.length > 0 && !hasSitemapRoot) {
    errors.push("Sitemap XML does not contain urlset or sitemapindex root.");
  }

  const urls = [...trimmed.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeXmlEntity(match[1] ?? "").trim())
    .filter(Boolean);

  if (trimmed.length > 0 && urls.length === 0) {
    errors.push("Sitemap XML contains no loc entries.");
  }

  return {
    urls,
    validXml: errors.length === 0,
    errors
  };
}

function decodeXmlEntity(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

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

  const hasSitemapRoot = hasOpeningTag(trimmed, "urlset") || hasOpeningTag(trimmed, "sitemapindex");
  if (trimmed.length > 0 && !hasSitemapRoot) {
    errors.push("Sitemap XML does not contain urlset or sitemapindex root.");
  }

  const urls = extractLocValues(trimmed)
    .map((value) => decodeXmlEntity(value).trim())
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

function extractLocValues(xml: string): string[] {
  const values: string[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const openEnd = findOpeningTagEnd(xml, "loc", cursor);
    if (openEnd < 0) {
      break;
    }
    const closeStart = findClosingTagStart(xml, "loc", openEnd);
    if (closeStart < 0) {
      break;
    }
    values.push(xml.slice(openEnd, closeStart));
    cursor = closeStart + 1;
  }
  return values;
}

function hasOpeningTag(xml: string, tagName: string): boolean {
  return findOpeningTagEnd(xml, tagName, 0) >= 0;
}

function findOpeningTagEnd(xml: string, tagName: string, from: number): number {
  let cursor = from;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) {
      return -1;
    }
    if (startsWithTagName(xml, tagName, start + 1)) {
      const end = xml.indexOf(">", start + tagName.length + 1);
      return end >= 0 ? end + 1 : -1;
    }
    cursor = start + 1;
  }
  return -1;
}

function findClosingTagStart(xml: string, tagName: string, from: number): number {
  let cursor = from;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) {
      return -1;
    }
    if (xml[start + 1] === "/" && startsWithTagName(xml, tagName, start + 2)) {
      return start;
    }
    cursor = start + 1;
  }
  return -1;
}

function startsWithTagName(xml: string, tagName: string, start: number): boolean {
  if (start + tagName.length > xml.length) {
    return false;
  }
  for (let offset = 0; offset < tagName.length; offset += 1) {
    if (asciiLowerChar(xml[start + offset] ?? "") !== asciiLowerChar(tagName[offset] ?? "")) {
      return false;
    }
  }
  const next = xml[start + tagName.length];
  return next === ">" || next === "/" || isXmlSpace(next);
}

function decodeXmlEntity(input: string): string {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function asciiLowerChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(code + 32);
  }
  return char;
}

function isXmlSpace(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  const code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || code === 32;
}

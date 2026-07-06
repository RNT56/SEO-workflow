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

interface HtmlTag {
  name: string;
  attrsText: string;
  start: number;
  end: number;
  closing: boolean;
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
    title: extractElementText(input.html, "title"),
    metaDescription: extractMeta(input.html, "description"),
    robotsMeta: extractMeta(input.html, "robots"),
    canonical: extractLinkRel(input.html, "canonical", input.finalUrl),
    hreflang: extractHreflang(input.html, input.finalUrl),
    lang: firstTagAttribute(input.html, "html", "lang"),
    viewport: extractMeta(input.html, "viewport"),
    headings: extractHeadings(input.html),
    wordCount: countWords(cleanText),
    internalLinks,
    externalLinks,
    images: extractImages(input.html, input.finalUrl),
    jsonLd: extractJsonLd(input.html),
    openGraph: extractPropertyMeta(input.html, "og:"),
    twitterCards: extractNamePrefixMeta(input.html, "twitter:"),
    hasSkipLink: hasSkipLink(input.html),
    forms: countOpeningTags(input.html, "form"),
    bodyExcerpt: cleanText.slice(0, 1200)
  };
}

export function htmlToText(html: string): string {
  return collapseWhitespace(decodeHtml(stripTags(stripInstructionalControlText(html)))).trim();
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "a") {
      continue;
    }
    const href = parseAttributes(tag.attrsText).get("href");
    const url = href ? normalizeHttpUrl(href, baseUrl) : null;
    if (url) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

function extractMeta(html: string, name: string): string | null {
  const expectedName = asciiLower(name);
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "meta") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    if (asciiLower(attrs.get("name") ?? "") === expectedName) {
      return nonEmpty(attrs.get("content") ?? "");
    }
  }
  return null;
}

function extractPropertyMeta(html: string, prefix: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "meta") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    const key = attrs.get("property") ?? "";
    const value = attrs.get("content") ?? "";
    if (key.startsWith(prefix)) {
      values[key] = value;
    }
  }
  return values;
}

function extractNamePrefixMeta(html: string, prefix: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "meta") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    const key = attrs.get("name") ?? "";
    const value = attrs.get("content") ?? "";
    if (key.startsWith(prefix)) {
      values[key] = value;
    }
  }
  return values;
}

function extractLinkRel(html: string, rel: string, baseUrl: string): string | null {
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "link") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    if (!hasRel(attrs.get("rel") ?? "", rel)) {
      continue;
    }
    const href = attrs.get("href");
    const url = href ? normalizeHttpUrl(href, baseUrl) : null;
    if (url) {
      return url;
    }
  }
  return null;
}

function extractHreflang(html: string, baseUrl: string): string[] {
  const values: string[] = [];
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "link") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    if (!hasRel(attrs.get("rel") ?? "", "alternate") || !attrs.has("hreflang")) {
      continue;
    }
    const href = attrs.get("href");
    const url = href ? normalizeHttpUrl(href, baseUrl) : null;
    if (url) {
      values.push(url);
    }
  }
  return values;
}

function extractHeadings(html: string): HeadingSnapshot[] {
  const headings: HeadingSnapshot[] = [];
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name.length !== 2 || tag.name[0] !== "h") {
      continue;
    }
    const level = Number(tag.name[1]);
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      continue;
    }
    const closeStart = findClosingTagStart(html, tag.name, tag.end);
    if (closeStart < 0) {
      continue;
    }
    const text = htmlToText(html.slice(tag.end, closeStart));
    if (text) {
      headings.push({ level, text });
    }
  }
  return headings;
}

function extractImages(html: string, baseUrl: string): ImageSnapshot[] {
  const images: ImageSnapshot[] = [];
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "img") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    const src = attrs.get("src");
    const url = src ? normalizeHttpUrl(src, baseUrl) : null;
    if (!url) {
      continue;
    }
    images.push({
      src: url,
      alt: attrs.get("alt") ?? null,
      hasWidth: attrs.has("width"),
      hasHeight: attrs.has("height")
    });
  }
  return images;
}

function extractJsonLd(html: string): JsonLdSnapshot[] {
  const scripts: JsonLdSnapshot[] = [];
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "script") {
      continue;
    }
    const attrs = parseAttributes(tag.attrsText);
    if (asciiLower(attrs.get("type") ?? "") !== "application/ld+json") {
      continue;
    }
    const closeStart = findClosingTagStart(html, "script", tag.end);
    if (closeStart < 0) {
      continue;
    }
    const raw = html.slice(tag.end, closeStart).trim();
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

function extractElementText(html: string, tagName: string): string | null {
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== tagName) {
      continue;
    }
    const closeStart = findClosingTagStart(html, tagName, tag.end);
    if (closeStart < 0) {
      return null;
    }
    return nonEmpty(htmlToText(html.slice(tag.end, closeStart)));
  }
  return null;
}

function firstTagAttribute(html: string, tagName: string, attrName: string): string | null {
  for (const tag of iterateTags(html)) {
    if (!tag.closing && tag.name === tagName) {
      return nonEmpty(parseAttributes(tag.attrsText).get(attrName) ?? "");
    }
  }
  return null;
}

function hasSkipLink(html: string): boolean {
  for (const tag of iterateTags(html)) {
    if (tag.closing || tag.name !== "a") {
      continue;
    }
    const href = parseAttributes(tag.attrsText).get("href")?.trim();
    if (href === "#main" || href === "#content" || href === "#main-content") {
      return true;
    }
  }
  return false;
}

function countOpeningTags(html: string, tagName: string): number {
  let count = 0;
  for (const tag of iterateTags(html)) {
    if (!tag.closing && tag.name === tagName) {
      count += 1;
    }
  }
  return count;
}

function normalizeHttpUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const compact = stripAsciiWhitespaceAndControls(trimmed).toLowerCase();
  if (
    compact.startsWith("javascript:") ||
    compact.startsWith("data:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("mailto:") ||
    compact.startsWith("tel:")
  ) {
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

function* iterateTags(html: string): Generator<HtmlTag> {
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      return;
    }
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : html.length;
      continue;
    }
    const tag = readTag(html, start);
    if (tag) {
      yield tag;
      index = tag.end;
    } else {
      index = start + 1;
    }
  }
}

function readTag(html: string, start: number): HtmlTag | null {
  let cursor = start + 1;
  if (cursor >= html.length) {
    return null;
  }
  if (html[cursor] === "!" || html[cursor] === "?") {
    return null;
  }

  let closing = false;
  if (html[cursor] === "/") {
    closing = true;
    cursor += 1;
  }

  while (cursor < html.length && isHtmlSpace(html.charCodeAt(cursor))) {
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < html.length && isTagNameChar(html.charCodeAt(cursor))) {
    cursor += 1;
  }
  if (cursor === nameStart) {
    return null;
  }

  const end = findTagEnd(html, cursor);
  if (end < 0) {
    return null;
  }

  return {
    name: asciiLower(html.slice(nameStart, cursor)),
    attrsText: closing ? "" : html.slice(cursor, end),
    start,
    end: end + 1,
    closing
  };
}

function findTagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function parseAttributes(attrsText: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let cursor = 0;
  while (cursor < attrsText.length) {
    while (cursor < attrsText.length && isHtmlSpace(attrsText.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (attrsText[cursor] === "/" || cursor >= attrsText.length) {
      break;
    }

    const nameStart = cursor;
    while (cursor < attrsText.length && isAttributeNameChar(attrsText.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }

    const name = asciiLower(attrsText.slice(nameStart, cursor));
    while (cursor < attrsText.length && isHtmlSpace(attrsText.charCodeAt(cursor))) {
      cursor += 1;
    }

    let value = "";
    if (attrsText[cursor] === "=") {
      cursor += 1;
      while (cursor < attrsText.length && isHtmlSpace(attrsText.charCodeAt(cursor))) {
        cursor += 1;
      }
      const quote = attrsText[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < attrsText.length && attrsText[cursor] !== quote) {
          cursor += 1;
        }
        value = attrsText.slice(valueStart, cursor);
        if (attrsText[cursor] === quote) {
          cursor += 1;
        }
      } else {
        const valueStart = cursor;
        while (
          cursor < attrsText.length &&
          !isHtmlSpace(attrsText.charCodeAt(cursor)) &&
          attrsText[cursor] !== ">"
        ) {
          cursor += 1;
        }
        value = attrsText.slice(valueStart, cursor);
      }
    }

    attrs.set(name, decodeHtml(value));
  }
  return attrs;
}

function findClosingTagStart(html: string, tagName: string, from: number): number {
  const needle = `</${tagName}`;
  let cursor = from;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) {
      return -1;
    }
    if (startsWithIgnoreCase(html, needle, start)) {
      const afterName = start + needle.length;
      const code = html.charCodeAt(afterName);
      if (Number.isNaN(code) || isHtmlSpace(code) || html[afterName] === ">") {
        return start;
      }
    }
    cursor = start + 1;
  }
  return -1;
}

function stripTags(html: string): string {
  let output = "";
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      output += html.slice(index);
      break;
    }
    output += html.slice(index, start);
    const tag = readTag(html, start);
    if (tag) {
      output += " ";
      index = tag.end;
    } else {
      output += html[start];
      index = start + 1;
    }
  }
  return output;
}

function hasRel(relValue: string, expected: string): boolean {
  const expectedLower = asciiLower(expected);
  for (const token of splitAsciiWhitespace(relValue)) {
    if (asciiLower(token) === expectedLower) {
      return true;
    }
  }
  return false;
}

function splitAsciiWhitespace(input: string): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    while (cursor < input.length && isHtmlSpace(input.charCodeAt(cursor))) {
      cursor += 1;
    }
    const start = cursor;
    while (cursor < input.length && !isHtmlSpace(input.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (cursor > start) {
      tokens.push(input.slice(start, cursor));
    }
  }
  return tokens;
}

function countWords(input: string): number {
  return splitAsciiWhitespace(input).length;
}

function collapseWhitespace(input: string): string {
  let output = "";
  let pendingSpace = false;
  for (let index = 0; index < input.length; index += 1) {
    if (isHtmlSpace(input.charCodeAt(index))) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace) {
      output += " ";
      pendingSpace = false;
    }
    output += input[index];
  }
  return output;
}

function stripAsciiWhitespaceAndControls(input: string): string {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code > 32 && code !== 127) {
      output += input[index];
    }
  }
  return output;
}

function decodeHtml(input: string): string {
  return input
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function nonEmpty(input: string): string | null {
  const value = input.trim();
  return value ? value : null;
}

function startsWithIgnoreCase(input: string, prefix: string, start: number): boolean {
  if (start + prefix.length > input.length) {
    return false;
  }
  for (let offset = 0; offset < prefix.length; offset += 1) {
    if (asciiLowerChar(input[start + offset] ?? "") !== asciiLowerChar(prefix[offset] ?? "")) {
      return false;
    }
  }
  return true;
}

function asciiLower(input: string): string {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    output += asciiLowerChar(input[index] ?? "");
  }
  return output;
}

function asciiLowerChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(code + 32);
  }
  return char;
}

function isHtmlSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function isTagNameChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 58
  );
}

function isAttributeNameChar(code: number): boolean {
  return code > 32 && code !== 34 && code !== 39 && code !== 47 && code !== 61 && code !== 62;
}

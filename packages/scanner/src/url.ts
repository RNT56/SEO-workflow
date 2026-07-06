import { isPrivateUrl } from "@seo-polish/security";

export function normalizeUrl(input: string, base?: string): string {
  const url = base ? new URL(input, base) : new URL(input);
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  return url.toString();
}

export function sameOrigin(left: string, right: string): boolean {
  return new URL(left).origin === new URL(right).origin;
}

export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafePublicCrawlUrl(input: string, origin: string): boolean {
  if (!isHttpUrl(input) || !sameOrigin(input, origin)) {
    return false;
  }

  if (isPrivateUrl(input)) {
    return false;
  }

  const path = new URL(input).pathname.toLowerCase();
  const extension = path.split(".").pop() ?? "";
  const blockedExtensions = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "pdf",
    "zip",
    "mp4",
    "mp3",
    "woff",
    "woff2"
  ]);
  return !blockedExtensions.has(extension);
}

export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => normalizeUrl(url)))];
}

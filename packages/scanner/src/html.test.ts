import { describe, expect, it } from "vitest";
import { extractHtmlSnapshot } from "./html.js";

describe("HTML extraction", () => {
  it("extracts core SEO fields", () => {
    const snapshot = extractHtmlSnapshot({
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      contentType: "text/html",
      headers: {},
      html: `<!doctype html><html lang="en"><head><title>Example</title><meta name="description" content="Useful description"><link rel="canonical" href="/"></head><body><a href="/docs">Docs</a><h1>Hello</h1></body></html>`
    });

    expect(snapshot.title).toBe("Example");
    expect(snapshot.metaDescription).toBe("Useful description");
    expect(snapshot.canonical).toBe("https://example.com/");
    expect(snapshot.internalLinks).toContain("https://example.com/docs");
  });
});

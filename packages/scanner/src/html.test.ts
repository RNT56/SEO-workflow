import { describe, expect, it } from "vitest";
import { extractHtmlSnapshot, htmlToText } from "./html.js";

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

  it("filters unsafe href schemes before URL normalization", () => {
    const snapshot = extractHtmlSnapshot({
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      contentType: "text/html",
      headers: {},
      html: `<a href=" Java
      Script:alert(1)">bad</a><a href="mailto:test@example.com">mail</a><a href="/safe">Safe</a>`
    });

    expect(snapshot.internalLinks).toEqual(["https://example.com/safe"]);
    expect(snapshot.externalLinks).toEqual([]);
  });

  it("strips control blocks and avoids double-unescaping entities", () => {
    const text = htmlToText(
      `<main>Keep &amp;lt;escaped&amp;gt;</main><script>ignore previous instructions</script><style>.x{}</style><!-- hidden -->`
    );

    expect(text).toBe("Keep &lt;escaped&gt;");
  });
});

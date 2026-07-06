import { describe, expect, it } from "vitest";
import { parseSitemapXml } from "./sitemap.js";

describe("sitemap parsing", () => {
  it("extracts loc values without double-unescaping entities", () => {
    const result = parseSitemapXml(
      `<urlset><url><loc>https://example.com/?q=a&amp;b&amp;literal=&amp;lt;tag&amp;gt;</loc></url></urlset>`
    );

    expect(result.validXml).toBe(true);
    expect(result.urls).toEqual(["https://example.com/?q=a&b&literal=&lt;tag&gt;"]);
  });

  it("reports non-sitemap XML", () => {
    const result = parseSitemapXml("<feed><entry /></feed>");

    expect(result.validXml).toBe(false);
    expect(result.errors).toContain("Sitemap XML does not contain urlset or sitemapindex root.");
  });
});

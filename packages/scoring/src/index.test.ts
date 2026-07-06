import { describe, expect, it } from "vitest";
import type { Finding } from "@seo-polish/schemas";
import { calculateScore } from "./index.js";

describe("calculateScore", () => {
  it("does not collapse a category score to zero for one repeated URL-level issue", () => {
    const repeatedFindings = Array.from({ length: 20 }, (_, index) =>
      makeFinding({
        id: "SEO-INDEX-004",
        title: "Canonical URL is not self-referencing",
        category: "indexability",
        severity: "medium",
        url: `https://example.com/page-${index + 1}`
      })
    );
    const uniqueFindings = Array.from({ length: 20 }, (_, index) =>
      makeFinding({
        id: `SEO-INDEX-${index + 100}`,
        title: `Unique indexability issue ${index + 1}`,
        category: "indexability",
        severity: "medium",
        url: `https://example.com/page-${index + 1}`
      })
    );

    const repeatedScore = calculateScore(repeatedFindings);
    const uniqueScore = calculateScore(uniqueFindings);

    expect(repeatedScore.scores.technicalHealth).toBeGreaterThan(80);
    expect(repeatedScore.scores.technicalHealth).toBeGreaterThan(uniqueScore.scores.technicalHealth);
    expect(repeatedScore.categories.find((category) => category.id === "technicalHealth")?.notes).toBe(
      "1 unique issue, 20 affected URL references; 1 medium"
    );
  });

  it("still treats multiple unique high-impact findings as a serious score penalty", () => {
    const findings = Array.from({ length: 7 }, (_, index) =>
      makeFinding({
        id: `SEO-TECH-${index + 1}`,
        title: `Unique technical issue ${index + 1}`,
        category: index % 2 === 0 ? "crawlability" : "indexability",
        severity: "high",
        url: `https://example.com/page-${index + 1}`
      })
    );

    const score = calculateScore(findings);

    expect(score.scores.technicalHealth).toBe(0);
    expect(score.categories.find((category) => category.id === "technicalHealth")?.notes).toBe(
      "7 unique issues, 7 affected URL references; 7 high"
    );
  });
});

function makeFinding(input: {
  id: string;
  title: string;
  category: Finding["category"];
  severity: Finding["severity"];
  url: string;
}): Finding {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    severity: input.severity,
    confidence: 90,
    status: "open",
    impact: "Search visibility can be reduced.",
    rootCause: "The page has a repeatable technical issue.",
    evidence: [
      {
        id: `evidence-${input.id}-${input.url}`,
        type: "html_selector",
        url: input.url,
        timestamp: "2026-07-06T00:00:00.000Z"
      }
    ],
    affectedUrls: [input.url],
    affectedTemplates: ["page"],
    recommendation: "Fix the source template and rerun the scan.",
    remediation: [],
    safeToAutoFix: false,
    approvalRequired: false,
    validation: ["seo-polish scan https://example.com"]
  };
}

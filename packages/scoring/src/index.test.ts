import { describe, expect, it } from "vitest";
import type { Finding } from "@seo-polish/schemas";
import { calculateScore } from "./index.js";

describe("calculateScore", () => {
  it("returns perfect bounded scores when there are no scoreable findings", () => {
    const score = calculateScore([]);

    expect(score.total).toBe(100);
    expect(Object.values(score.scores)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(score.categories.every((category) => category.score >= 0 && category.score <= 100)).toBe(true);
  });

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

  it("ignores passed and not-applicable findings defensively", () => {
    const score = calculateScore([
      {
        ...makeFinding({
          id: "SEO-INDEX-004",
          title: "Canonical URL is not self-referencing",
          category: "indexability",
          severity: "critical",
          url: "https://example.com/passed"
        }),
        status: "passed"
      },
      {
        ...makeFinding({
          id: "SEO-MEDIA-001",
          title: "Images are missing alt text",
          category: "media_seo",
          severity: "critical",
          url: "https://example.com/not-applicable"
        }),
        status: "not_applicable"
      }
    ]);

    expect(score.total).toBe(100);
    expect(score.categories.find((category) => category.id === "seo")?.notes).toBe(
      "No relevant issues found in this scan."
    );
  });

  it("clamps confidence values and evidence URL fallback while preserving score bounds", () => {
    const score = calculateScore([
      {
        ...makeFinding({
          id: "SEO-INDEX-004",
          title: "Canonical URL is not self-referencing",
          category: "indexability",
          severity: "medium",
          url: "https://example.com/from-evidence"
        }),
        affectedUrls: [],
        confidence: 250
      },
      {
        ...makeFinding({
          id: "SEO-MEDIA-001",
          title: "Images are missing alt text",
          category: "media_seo",
          severity: "medium",
          url: "https://example.com/negative-confidence"
        }),
        confidence: -25
      }
    ]);

    expect(score.categories.every((category) => category.score >= 0 && category.score <= 100)).toBe(true);
    expect(score.categories.find((category) => category.id === "technicalHealth")?.notes).toBe(
      "1 unique issue, 1 affected URL reference; 1 medium"
    );
    expect(score.scores.performanceAccessibility).toBe(100);
  });

  it("keeps the primary and experimental scores within bounds for mixed severities", () => {
    const score = calculateScore([
      makeFinding({
        id: "SEO-SITEMAP-002",
        title: "sitemap.xml does not expose canonical URLs",
        category: "crawlability",
        severity: "high",
        url: "https://example.com/"
      }),
      makeFinding({
        id: "AR-LLMS-001",
        title: "llms.txt is missing",
        category: "agent_readiness",
        severity: "high",
        url: "https://example.com/llms.txt"
      }),
      makeFinding({
        id: "AR-ROBOTS-006",
        title: "robots.txt does not block common private areas",
        category: "security",
        severity: "medium",
        url: "https://example.com/robots.txt"
      })
    ]);

    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.experimentalCombined).toBe(
      Math.round(
        score.scores.seo * 0.25 +
          score.scores.agentReadiness * 0.2 +
          score.scores.technicalHealth * 0.2 +
          score.scores.contentQuality * 0.15 +
          score.scores.performanceAccessibility * 0.1 +
          score.scores.securityPolicy * 0.1
      )
    );
    expect(score.total).toBe(score.profiles.core_seo.score);
    expect(score.categories.find((category) => category.id === "experimentalCombined")?.score).toBe(
      score.experimentalCombined
    );
  });

  it("does not let experimental agent findings reduce the primary SEO grade", () => {
    const agentFinding = makeFinding({
      id: "AR-LLMS-001",
      title: "llms.txt is missing",
      category: "agent_readiness",
      severity: "critical",
      url: "https://example.com/llms.txt"
    });

    const score = calculateScore(
      [agentFinding],
      [
        {
          ruleId: "AR-LLMS-001",
          category: "agent_readiness",
          maturity: "experimental",
          status: "failed",
          applicable: true,
          measured: true,
          findingCount: 1,
          reason: "Fixture finding."
        }
      ]
    );

    expect(score.total).toBe(100);
    expect(score.profiles.agent_readiness.score).toBeLessThan(100);
    expect(score.experimentalCombined).toBeLessThan(100);
    expect(score.coverage.percentMeasured).toBe(100);
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

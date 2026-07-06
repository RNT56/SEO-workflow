import type {
  Finding,
  FindingCategory,
  Score,
  ScoreCategory,
  ScoreLevel,
  Severity
} from "@seo-polish/schemas";

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 6,
  low: 2,
  info: 0.5
};

interface AreaDefinition {
  id: keyof Score["scores"];
  label: string;
  maxScore: number;
  categories: FindingCategory[];
}

const AREAS: AreaDefinition[] = [
  {
    id: "seo",
    label: "SEO",
    maxScore: 100,
    categories: [
      "technical_seo",
      "crawlability",
      "indexability",
      "onpage_seo",
      "content_seo",
      "internal_linking",
      "structured_data",
      "javascript_seo",
      "media_seo",
      "performance_seo",
      "accessibility",
      "international_seo",
      "local_seo",
      "ecommerce_seo"
    ]
  },
  {
    id: "agentReadiness",
    label: "Agent Readiness",
    maxScore: 100,
    categories: ["agent_readiness", "protocol_discovery", "api_auth_mcp", "policy"]
  },
  {
    id: "technicalHealth",
    label: "Technical Health",
    maxScore: 100,
    categories: ["technical_seo", "crawlability", "indexability", "javascript_seo"]
  },
  {
    id: "contentQuality",
    label: "Content Quality",
    maxScore: 100,
    categories: ["content_seo", "onpage_seo", "structured_data", "internal_linking"]
  },
  {
    id: "performanceAccessibility",
    label: "Performance & Accessibility",
    maxScore: 100,
    categories: ["performance_seo", "media_seo", "accessibility", "javascript_seo"]
  },
  {
    id: "securityPolicy",
    label: "Security & Policy",
    maxScore: 100,
    categories: ["security", "policy"]
  }
];

const COMBINED_WEIGHTS: Record<keyof Score["scores"], number> = {
  seo: 25,
  agentReadiness: 20,
  technicalHealth: 20,
  contentQuality: 15,
  performanceAccessibility: 10,
  securityPolicy: 10
};

export function calculateScore(findings: Finding[]): Score {
  const scores = Object.fromEntries(
    AREAS.map((area) => [area.id, scoreArea(findings, area.categories)])
  ) as Score["scores"];

  const total = Math.round(
    (Object.entries(scores) as Array<[keyof Score["scores"], number]>).reduce(
      (sum, [key, value]) => sum + value * (COMBINED_WEIGHTS[key] / 100),
      0
    )
  );

  const categories: ScoreCategory[] = AREAS.map((area) => ({
    id: area.id,
    label: area.label,
    score: scores[area.id],
    maxScore: area.maxScore,
    status: scoreLevel(scores[area.id]),
    notes: categoryNotes(findings, area.categories)
  }));

  categories.push({
    id: "combined",
    label: "Combined SEO Polish Score",
    score: total,
    maxScore: 100,
    status: scoreLevel(total),
    notes: total >= 90 ? "Excellent foundation." : "Prioritize high-impact evidence-backed findings."
  });

  return {
    total,
    level: scoreLevel(total),
    scores,
    categories
  };
}

function scoreArea(findings: Finding[], categories: FindingCategory[]): number {
  const relevant = findings.filter((finding) => categories.includes(finding.category));
  const penalty = relevant.reduce(
    (sum, finding) => sum + SEVERITY_PENALTY[finding.severity] * (finding.confidence / 100),
    0
  );
  return clampScore(Math.round(100 - penalty));
}

function categoryNotes(findings: Finding[], categories: FindingCategory[]): string {
  const relevant = findings.filter((finding) => categories.includes(finding.category));
  if (relevant.length === 0) {
    return "No relevant issues found in this scan.";
  }
  const counts = countBySeverity(relevant);
  const parts = (Object.entries(counts) as Array<[Severity, number]>)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${count} ${severity}`);
  return parts.join(", ");
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );
}

function scoreLevel(score: number): ScoreLevel {
  if (score >= 90) return "excellent";
  if (score >= 75) return "strong";
  if (score >= 60) return "medium";
  if (score >= 40) return "weak";
  return "critical";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

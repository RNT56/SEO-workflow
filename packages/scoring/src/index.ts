import type {
  Finding,
  FindingCategory,
  Score,
  ScoreCategory,
  ScoreLevel,
  Severity
} from "@seo-polish/schemas";

const SEVERITY_BASE_PENALTY: Record<Severity, number> = {
  critical: 30,
  high: 16,
  medium: 8,
  low: 3,
  info: 0.5
};

const REPEAT_PENALTY_PER_EXTRA_INSTANCE: Record<Severity, number> = {
  critical: 2.5,
  high: 1.5,
  medium: 0.75,
  low: 0.25,
  info: 0.05
};

const REPEAT_PENALTY_CAP: Record<Severity, number> = {
  critical: 20,
  high: 12,
  medium: 8,
  low: 3,
  info: 0.5
};

interface AreaDefinition {
  id: keyof Score["scores"];
  label: string;
  maxScore: number;
  categories: FindingCategory[];
}

interface FindingGroup {
  severity: Severity;
  confidence: number;
  count: number;
  affectedUrls: Set<string>;
  affectedTemplates: Set<string>;
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
  const groups = groupFindings(findings, categories);
  const penalty = groups.reduce((sum, group) => sum + scoreGroupPenalty(group), 0);
  return clampScore(Math.round(100 - penalty));
}

function categoryNotes(findings: Finding[], categories: FindingCategory[]): string {
  const groups = groupFindings(findings, categories);
  if (groups.length === 0) {
    return "No relevant issues found in this scan.";
  }
  const counts = countGroupsBySeverity(groups);
  const parts = (Object.entries(counts) as Array<[Severity, number]>)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${count} ${severity}`);
  const affectedUrlReferences = groups.reduce(
    (sum, group) => sum + Math.max(group.affectedUrls.size, group.count),
    0
  );
  return `${groups.length} unique issue${groups.length === 1 ? "" : "s"}, ${affectedUrlReferences} affected URL reference${affectedUrlReferences === 1 ? "" : "s"}; ${parts.join(", ")}`;
}

function groupFindings(findings: Finding[], categories: FindingCategory[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    if (!categories.includes(finding.category)) {
      continue;
    }

    const key = [finding.id, finding.title, finding.category, finding.severity].join("|");
    const group =
      groups.get(key) ??
      ({
        severity: finding.severity,
        confidence: finding.confidence,
        count: 0,
        affectedUrls: new Set<string>(),
        affectedTemplates: new Set<string>()
      } satisfies FindingGroup);

    group.count += 1;
    group.confidence = Math.max(group.confidence, finding.confidence);
    for (const url of finding.affectedUrls) {
      group.affectedUrls.add(url);
    }
    for (const template of finding.affectedTemplates) {
      group.affectedTemplates.add(template);
    }
    groups.set(key, group);
  }

  return [...groups.values()];
}

function scoreGroupPenalty(group: FindingGroup): number {
  const confidenceFactor = group.confidence / 100;
  const basePenalty = SEVERITY_BASE_PENALTY[group.severity] * confidenceFactor;
  const repeatedInstances = Math.max(
    0,
    Math.max(group.count, group.affectedUrls.size, group.affectedTemplates.size) - 1
  );
  const repeatPenalty = Math.min(
    repeatedInstances * REPEAT_PENALTY_PER_EXTRA_INSTANCE[group.severity] * confidenceFactor,
    REPEAT_PENALTY_CAP[group.severity] * confidenceFactor
  );

  return basePenalty + repeatPenalty;
}

function countGroupsBySeverity(groups: FindingGroup[]): Record<Severity, number> {
  return groups.reduce<Record<Severity, number>>(
    (acc, group) => {
      acc[group.severity] += 1;
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

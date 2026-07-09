import type {
  Finding,
  FindingCategory,
  FindingStatus,
  RuleEvaluation,
  Score,
  ScoreCategory,
  ScoreCoverage,
  ScoreLevel,
  ScoreProfile,
  ScoreProfileId,
  Severity
} from "@seo-polish/schemas";

const MAX_SCORE = 100;

const SCOREABLE_STATUSES = new Set<FindingStatus>(["open", "warning"]);

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

const CORE_SEO_CATEGORIES: FindingCategory[] = [
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
  "ecommerce_seo",
  "security"
];

const PROFILE_DEFINITIONS: Array<{
  id: ScoreProfileId;
  label: string;
  categories: FindingCategory[];
  maturity: ScoreProfile["maturity"];
  includedInPrimary: boolean;
}> = [
  {
    id: "core_seo",
    label: "Core SEO Health",
    categories: CORE_SEO_CATEGORIES,
    maturity: "stable",
    includedInPrimary: true
  },
  {
    id: "experience",
    label: "Performance & Accessibility",
    categories: ["performance_seo", "media_seo", "accessibility", "javascript_seo"],
    maturity: "stable",
    includedInPrimary: true
  },
  {
    id: "agent_readiness",
    label: "Agent Readiness (Experimental)",
    categories: ["agent_readiness", "protocol_discovery", "api_auth_mcp"],
    maturity: "experimental",
    includedInPrimary: false
  },
  {
    id: "governance",
    label: "Security & Policy Governance",
    categories: ["security", "policy"],
    maturity: "emerging",
    includedInPrimary: false
  }
];

export function calculateScore(findings: Finding[], evaluations: RuleEvaluation[] = []): Score {
  const scores = Object.fromEntries(
    AREAS.map((area) => [area.id, scoreArea(findings, area.categories)])
  ) as Score["scores"];

  const total = scoreArea(findings, CORE_SEO_CATEGORIES, stableMeasuredRuleIds(evaluations));
  const experimentalCombined = weightedScore(scores, COMBINED_WEIGHTS);
  const coverage = buildCoverage(evaluations);
  const profiles = Object.fromEntries(
    PROFILE_DEFINITIONS.map((definition) => {
      const profileEvaluations = evaluations.filter((evaluation) =>
        definition.categories.includes(evaluation.category)
      );
      const allowedRuleIds =
        definition.id === "core_seo" ? stableMeasuredRuleIds(profileEvaluations) : undefined;
      const score = scoreArea(findings, definition.categories, allowedRuleIds);
      const profileCoverage = buildCoverage(profileEvaluations);
      const profile: ScoreProfile = {
        id: definition.id,
        label: definition.label,
        score,
        level: scoreLevel(score),
        maturity: definition.maturity,
        includedInPrimary: definition.includedInPrimary,
        coverage: profileCoverage,
        notes: coverageNote(profileCoverage)
      };
      return [definition.id, profile];
    })
  ) as Record<ScoreProfileId, ScoreProfile>;

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
    label: "Primary Core SEO Score",
    score: total,
    maxScore: 100,
    status: scoreLevel(total),
    notes:
      total >= 90
        ? `Excellent core foundation. ${coverageNote(profiles.core_seo.coverage)}`
        : `Prioritize high-impact core findings. ${coverageNote(profiles.core_seo.coverage)}`
  });
  categories.push({
    id: "experimentalCombined",
    label: "Experimental Composite",
    score: experimentalCombined,
    maxScore: 100,
    status: scoreLevel(experimentalCombined),
    notes:
      "Informational composite that includes agent-readiness and policy signals; it is not the primary SEO grade."
  });

  return {
    total,
    level: scoreLevel(total),
    scores,
    categories,
    profiles,
    coverage,
    experimentalCombined
  };
}

function scoreArea(findings: Finding[], categories: FindingCategory[], allowedRuleIds?: Set<string>): number {
  const groups = groupFindings(findings, categories, allowedRuleIds);
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

function groupFindings(
  findings: Finding[],
  categories: FindingCategory[],
  allowedRuleIds?: Set<string>
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    if (
      !categories.includes(finding.category) ||
      !SCOREABLE_STATUSES.has(finding.status) ||
      (allowedRuleIds && !allowedRuleIds.has(finding.id))
    ) {
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
    for (const evidence of finding.evidence) {
      if (evidence.url) {
        group.affectedUrls.add(evidence.url);
      }
    }
    groups.set(key, group);
  }

  return [...groups.values()];
}

function stableMeasuredRuleIds(evaluations: RuleEvaluation[]): Set<string> | undefined {
  if (evaluations.length === 0) {
    return undefined;
  }
  return new Set(
    evaluations
      .filter((evaluation) => evaluation.maturity === "stable" && evaluation.measured)
      .map((evaluation) => evaluation.ruleId)
  );
}

function buildCoverage(evaluations: RuleEvaluation[]): ScoreCoverage {
  const applicable = evaluations.filter((evaluation) => evaluation.applicable);
  const measured = applicable.filter((evaluation) => evaluation.measured);
  return {
    catalogRules: evaluations.length,
    applicableRules: applicable.length,
    measuredRules: measured.length,
    passedRules: measured.filter((evaluation) => evaluation.status === "passed").length,
    failedRules: measured.filter((evaluation) => evaluation.status === "failed").length,
    notApplicableRules: evaluations.filter((evaluation) => evaluation.status === "not_applicable").length,
    notMeasuredRules: applicable.filter((evaluation) => evaluation.status === "not_measured").length,
    percentMeasured: applicable.length === 0 ? 0 : Math.round((measured.length / applicable.length) * 100)
  };
}

function coverageNote(coverage: ScoreCoverage): string {
  if (coverage.catalogRules === 0) {
    return "Rule coverage metadata was not supplied.";
  }
  return `${coverage.measuredRules}/${coverage.applicableRules} applicable rules measured (${coverage.percentMeasured}%).`;
}

function scoreGroupPenalty(group: FindingGroup): number {
  const confidenceFactor = clamp(group.confidence, 0, 100) / 100;
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
  return clamp(value, 0, MAX_SCORE);
}

function weightedScore(
  scores: Record<keyof Score["scores"], number>,
  weights: Record<keyof Score["scores"], number>
): number {
  const entries = Object.entries(weights) as Array<[keyof Score["scores"], number]>;
  const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (weightTotal <= 0) {
    return MAX_SCORE;
  }
  return clampScore(
    Math.round(entries.reduce((sum, [key, weight]) => sum + scores[key] * weight, 0) / weightTotal)
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

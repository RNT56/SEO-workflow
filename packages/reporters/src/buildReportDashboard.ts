import type {
  ActionOwner,
  AutomationReadiness,
  BaselineComparison,
  BudgetStatus,
  Effort,
  Finding,
  FindingCategory,
  FixClass,
  PerformanceMetricSnapshot,
  RemediationOption,
  ReportBundle,
  ReportDashboard,
  ReportDashboardBaselineSummary,
  ReportDashboardMatrixQuadrant,
  ReportDashboardPerformanceSummary,
  ReportDashboardQueueItem,
  ReportDashboardTemplateHeatmapItem,
  ResourceTimingSnapshot,
  Severity
} from "@seo-polish/schemas";
import { SEVERITY_ORDER, groupFindings, uniqueRemediationOptions } from "./reportSignal.js";

export interface ReportDashboardQualityGate {
  status?: "passed" | "failed" | string;
  reportValid?: boolean;
  stopConditions?: string[];
}

export interface ReportDashboardOptions {
  baselineComparison?: BaselineComparison | null;
  qualityGate?: ReportDashboardQualityGate | null;
}

const IMPACT_WEIGHT: Record<ReportDashboardQueueItem["expectedImpact"], number> = {
  high: 0,
  medium: 1,
  low: 2
};

const EFFORT_WEIGHT: Record<Effort, number> = {
  small: 0,
  medium: 1,
  large: 2
};

const FIX_CLASS_WEIGHT: Record<FixClass, number> = {
  safe_auto_fix: 0,
  manual_strategy: 1,
  approval_required: 2,
  not_applicable: 3
};

export function buildReportDashboard(
  bundle: ReportBundle,
  options: ReportDashboardOptions = {}
): ReportDashboard {
  const implementationQueue = buildImplementationQueue(bundle);
  const approvalQueue = implementationQueue.filter((item) => item.approvalRequired);
  const nextBestFixes = implementationQueue
    .filter((item) => !item.approvalRequired && item.fixClass !== "not_applicable")
    .sort(queuePrioritySort)
    .slice(0, 8);

  const qualityGateStatus = normalizeQualityGateStatus(options.qualityGate?.status);
  const performanceSummary = buildPerformanceSummary(bundle);
  const baselineSummary = buildBaselineSummary(options.baselineComparison ?? null);
  const evidenceStats = buildEvidenceStats(bundle, implementationQueue, approvalQueue);

  return {
    generatedAt: new Date().toISOString(),
    targetUrl: bundle.scan.config.url,
    score: bundle.score,
    validationOk: bundle.validation.ok,
    qualityGateStatus,
    executiveSummary: {
      topRisks: implementationQueue
        .filter((item) => item.severity === "critical" || item.severity === "high")
        .slice(0, 5),
      topWins: nextBestFixes.filter((item) => item.expectedImpact !== "low").slice(0, 5),
      remainingApprovals: approvalQueue.length,
      validationState: bundle.validation.ok ? "passed" : "failed",
      qualityGateStatus
    },
    filters: {
      owners: sortedUnique(implementationQueue.map((item) => item.owner)),
      fixClasses: sortedUnique(implementationQueue.map((item) => item.fixClass)),
      automationReadiness: sortedUnique(implementationQueue.map((item) => item.automationReadiness)),
      approvalStates: ["approval_required", "no_approval_required"]
    },
    nextBestFixes,
    implementationQueue,
    approvalQueue,
    impactEffortMatrix: buildImpactEffortMatrix(implementationQueue),
    templateHeatmap: buildTemplateHeatmap(bundle),
    performanceSummary,
    baselineSummary,
    evidenceStats
  };
}

function buildImplementationQueue(bundle: ReportBundle): ReportDashboardQueueItem[] {
  const groups = groupFindings(bundle.findings);
  const groupsByFindingId = new Map(groups.map((group) => [group.id, group]));
  const findingsById = new Map<string, Finding>();
  for (const finding of bundle.findings) {
    if (!findingsById.has(finding.id)) {
      findingsById.set(finding.id, finding);
    }
  }

  const options = uniqueRemediationOptions([
    ...bundle.remediationPlan.phases.flatMap((phase) => phase.items),
    ...bundle.remediationPlan.safeFixes,
    ...bundle.remediationPlan.manualRecommendations,
    ...bundle.remediationPlan.approvalRequired
  ]);

  const queue = options.map((option) =>
    queueItemFromRemediation(
      option,
      findingsById.get(option.findingId),
      groupsByFindingId.get(option.findingId)
    )
  );
  const queuedFindingIds = new Set(queue.map((item) => item.findingId));
  for (const group of groups) {
    if (queuedFindingIds.has(group.id)) {
      continue;
    }
    const finding = findingsById.get(group.id);
    if (finding) {
      queue.push(queueItemFromFinding(finding, group));
    }
  }

  return queue.sort(queuePrioritySort);
}

function queueItemFromRemediation(
  option: RemediationOption,
  finding: Finding | undefined,
  group: ReturnType<typeof groupFindings>[number] | undefined
): ReportDashboardQueueItem {
  const actionability = finding?.actionability;
  const owner = actionability?.owner ?? fallbackOwner(finding?.category);
  const sourceCandidates = uniqueStrings([
    ...(actionability?.sourceLocations ?? []),
    option.implementationPath
  ]).slice(0, 8);
  return {
    id: slugify(`${option.findingId}-${option.id}`),
    findingId: option.findingId,
    title: option.title || finding?.title || option.findingId,
    severity: finding?.severity ?? "medium",
    category: finding?.category ?? "policy",
    owner,
    automationReadiness: actionability?.automationReadiness ?? readinessFromFixClass(option.fixClass),
    fixClass: option.fixClass,
    effort: option.effort,
    risk: option.risk,
    expectedImpact: actionability?.expectedImpact ?? impactFromSeverity(finding?.severity ?? "medium"),
    approvalRequired: option.fixClass === "approval_required" || Boolean(finding?.approvalRequired),
    safeToAutoFix: option.fixClass === "safe_auto_fix" && !finding?.approvalRequired,
    sourceCandidates,
    affectedTemplates: [...(group?.affectedTemplates ?? new Set<string>())].sort(),
    affectedUrls: [...(group?.affectedUrls ?? new Set<string>())].sort(),
    validationCommand:
      option.validation[0] ?? finding?.validation[0] ?? "seo-polish report lint <report-dir> --strict",
    nextStep: actionability?.nextStep ?? option.implementationPath,
    instances: group?.count ?? 1,
    evidenceCount: group?.evidenceCount ?? finding?.evidence.length ?? 0
  };
}

function queueItemFromFinding(
  finding: Finding,
  group: ReturnType<typeof groupFindings>[number]
): ReportDashboardQueueItem {
  const actionability = finding.actionability;
  return {
    id: slugify(`${finding.id}-finding`),
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    owner: actionability?.owner ?? fallbackOwner(finding.category),
    automationReadiness: actionability?.automationReadiness ?? (finding.safeToAutoFix ? "auto" : "manual"),
    fixClass: finding.approvalRequired
      ? "approval_required"
      : finding.safeToAutoFix
        ? "safe_auto_fix"
        : "manual_strategy",
    effort: finding.severity === "critical" || finding.severity === "high" ? "medium" : "small",
    risk: finding.approvalRequired ? "high" : finding.severity === "critical" ? "medium" : "low",
    expectedImpact: actionability?.expectedImpact ?? impactFromSeverity(finding.severity),
    approvalRequired: finding.approvalRequired,
    safeToAutoFix: finding.safeToAutoFix,
    sourceCandidates: uniqueStrings(actionability?.sourceLocations ?? []).slice(0, 8),
    affectedTemplates: [...group.affectedTemplates].sort(),
    affectedUrls: [...group.affectedUrls].sort(),
    validationCommand: finding.validation[0] ?? "seo-polish report lint <report-dir> --strict",
    nextStep: actionability?.nextStep ?? finding.recommendation,
    instances: group.count,
    evidenceCount: group.evidenceCount
  };
}

function buildImpactEffortMatrix(queue: ReportDashboardQueueItem[]): ReportDashboardMatrixQuadrant[] {
  const quickWins = queue.filter(
    (item) => !item.approvalRequired && item.effort === "small" && item.expectedImpact !== "low"
  );
  const majorProjects = queue.filter(
    (item) => !item.approvalRequired && item.expectedImpact === "high" && item.effort !== "small"
  );
  const strategicApprovals = queue.filter((item) => item.approvalRequired);
  const allocated = new Set([...quickWins, ...majorProjects, ...strategicApprovals].map((item) => item.id));
  const fillIns = queue.filter((item) => !allocated.has(item.id) && !item.approvalRequired);

  return [
    quadrant(
      "quick_wins",
      "High impact / low effort",
      "Do these first when source ownership is clear.",
      quickWins
    ),
    quadrant(
      "major_projects",
      "High impact / higher effort",
      "Plan these as focused implementation passes.",
      majorProjects
    ),
    quadrant("fill_ins", "Lower impact / lower effort", "Batch these after blockers are handled.", fillIns),
    quadrant(
      "strategic_approvals",
      "Approval-gated strategy",
      "Hold until the site owner decides.",
      strategicApprovals
    )
  ];
}

function quadrant(
  id: ReportDashboardMatrixQuadrant["id"],
  label: string,
  summary: string,
  items: ReportDashboardQueueItem[]
): ReportDashboardMatrixQuadrant {
  return { id, label, summary, items: items.sort(queuePrioritySort).slice(0, 12) };
}

function buildTemplateHeatmap(bundle: ReportBundle): ReportDashboardTemplateHeatmapItem[] {
  const routeDetails = new Map(
    (bundle.scan.routeTemplates ?? []).map((template) => [
      template.label,
      {
        urlPattern: template.urlPattern,
        representativeUrl: template.representativeUrl,
        pageCount: template.pageCount,
        sourceCandidates: template.sourceCandidates
      }
    ])
  );
  const heatmap = new Map<string, ReportDashboardTemplateHeatmapItem>();

  for (const finding of bundle.findings) {
    const templates =
      finding.affectedTemplates.length > 0 ? finding.affectedTemplates : ["Unmapped URL-level issues"];
    for (const template of templates) {
      const details = routeDetails.get(template);
      const existing = heatmap.get(template) ?? {
        template,
        urlPattern: details?.urlPattern ?? null,
        representativeUrl: details?.representativeUrl ?? null,
        pageCount: details?.pageCount ?? 0,
        issueCount: 0,
        criticalHighCount: 0,
        findingIds: [],
        sourceCandidates: [],
        affectedUrls: [],
        owners: []
      };
      existing.issueCount += 1;
      if (finding.severity === "critical" || finding.severity === "high") {
        existing.criticalHighCount += 1;
      }
      existing.findingIds = uniqueStrings([...existing.findingIds, finding.id]).sort();
      existing.sourceCandidates = uniqueStrings([
        ...existing.sourceCandidates,
        ...(details?.sourceCandidates ?? []),
        ...(finding.actionability?.sourceLocations ?? [])
      ]).slice(0, 8);
      existing.affectedUrls = uniqueStrings([...existing.affectedUrls, ...finding.affectedUrls]).slice(0, 8);
      existing.owners = sortedUnique([
        ...existing.owners,
        finding.actionability?.owner ?? fallbackOwner(finding.category)
      ]);
      heatmap.set(template, existing);
    }
  }

  return [...heatmap.values()].sort(
    (left, right) =>
      right.criticalHighCount - left.criticalHighCount ||
      right.issueCount - left.issueCount ||
      left.template.localeCompare(right.template)
  );
}

function buildPerformanceSummary(bundle: ReportBundle): ReportDashboardPerformanceSummary {
  const performance = bundle.scan.performance;
  const browserEvidence = bundle.scan.browserEvidence;
  const metrics = performance?.metrics ?? [notMeasuredPerformanceMetric()];
  const resources = performance?.resources ?? [];
  const documentDurations = (performance?.fetchTimings ?? [])
    .filter((timing) => /html|xhtml/i.test(timing.contentType ?? ""))
    .map((timing) => timing.totalMs)
    .sort((a, b) => a - b);
  const thirdPartyResources = resources.filter((resource) => resource.thirdParty);

  return {
    statusCounts: statusCounts(metrics),
    metrics,
    largestAssets: resources
      .filter(
        (resource): resource is ResourceTimingSnapshot & { bytes: number } =>
          typeof resource.bytes === "number"
      )
      .sort((left, right) => right.bytes - left.bytes || left.url.localeCompare(right.url))
      .slice(0, 10)
      .map((resource) => ({
        url: resource.url,
        type: resource.type,
        bytes: resource.bytes,
        thirdParty: resource.thirdParty,
        renderBlocking: resource.renderBlocking
      })),
    thirdParty: {
      requests: thirdPartyResources.length,
      knownKb: round1(thirdPartyResources.reduce((sum, resource) => sum + (resource.bytes ?? 0), 0) / 1024),
      hosts: sortedUnique(thirdPartyResources.map((resource) => hostname(resource.url)))
        .filter(Boolean)
        .slice(0, 12)
    },
    renderBlocking: resources
      .filter((resource) => resource.renderBlocking)
      .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0) || left.url.localeCompare(right.url))
      .slice(0, 12)
      .map((resource) => ({
        url: resource.url,
        type: resource.type,
        bytes: resource.bytes ?? null,
        totalMs: resource.totalMs ?? null
      })),
    timing: {
      runs: performance?.fetchTimings.length ?? 0,
      minDocumentFetchMs: documentDurations[0] ?? null,
      medianDocumentFetchMs: performance?.summary.medianDocumentFetchMs ?? null,
      p95DocumentFetchMs: performance?.summary.p95DocumentFetchMs ?? null,
      maxDocumentFetchMs: documentDurations[documentDurations.length - 1] ?? null
    },
    browserEvidence: {
      status: browserEvidence?.status ?? "disabled",
      pagesVisited: browserEvidence?.summary.pagesVisited ?? 0,
      consoleErrors: browserEvidence?.summary.consoleErrors ?? 0,
      consoleWarnings: browserEvidence?.summary.consoleWarnings ?? 0,
      pageErrors: browserEvidence?.summary.pageErrors ?? 0,
      failedRequests: browserEvidence?.summary.failedRequests ?? 0,
      detectedFrameworks: browserEvidence?.summary.detectedFrameworks ?? [],
      detectedBundlers: browserEvidence?.summary.detectedBundlers ?? [],
      hydrationRiskUrls: browserEvidence?.summary.hydrationRiskUrls ?? [],
      browserMetricCoverage: browserEvidence?.summary.browserMetricCoverage ?? {
        ttfb: 0,
        fcp: 0,
        lcp: 0,
        cls: 0,
        inp: 0
      }
    },
    limitations: performance?.limitations ?? ["Performance audit was not collected for this report."]
  };
}

function buildBaselineSummary(baseline: BaselineComparison | null): ReportDashboardBaselineSummary {
  if (!baseline) {
    return {
      status: "not_configured",
      scoreDelta: null,
      newFindingGroups: [],
      resolvedFindingGroups: [],
      recurringFindingGroups: [],
      unchangedFindingGroups: [],
      performanceDeltas: {},
      notes: ["No baseline comparison was configured."]
    };
  }
  return {
    status: baseline.status,
    scoreDelta: baseline.scoreDelta ?? null,
    newFindingGroups: baseline.newFindingGroups,
    resolvedFindingGroups: baseline.resolvedFindingGroups,
    recurringFindingGroups: baseline.recurringFindingGroups,
    unchangedFindingGroups: baseline.recurringFindingGroups,
    performanceDeltas: baseline.performanceDeltas,
    notes: baseline.notes
  };
}

function buildEvidenceStats(
  bundle: ReportBundle,
  implementationQueue: ReportDashboardQueueItem[],
  approvalQueue: ReportDashboardQueueItem[]
): ReportDashboard["evidenceStats"] {
  const groupedFindings = groupFindings(bundle.findings).length;
  return {
    evidenceEntries:
      bundle.scan.evidence.length ||
      bundle.findings.reduce((sum, finding) => sum + finding.evidence.length, 0),
    findings: bundle.findings.length,
    groupedFindings,
    pages: bundle.scan.pages.length,
    resources: bundle.scan.performance?.resources.length ?? 0,
    validationCommands: uniqueStrings(implementationQueue.map((item) => item.validationCommand)).length,
    approvalRequired: approvalQueue.length,
    safeAutoFixes: implementationQueue.filter((item) => item.safeToAutoFix).length
  };
}

function queuePrioritySort(left: ReportDashboardQueueItem, right: ReportDashboardQueueItem): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    IMPACT_WEIGHT[left.expectedImpact] - IMPACT_WEIGHT[right.expectedImpact] ||
    Number(left.approvalRequired) - Number(right.approvalRequired) ||
    FIX_CLASS_WEIGHT[left.fixClass] - FIX_CLASS_WEIGHT[right.fixClass] ||
    EFFORT_WEIGHT[left.effort] - EFFORT_WEIGHT[right.effort] ||
    left.findingId.localeCompare(right.findingId) ||
    left.id.localeCompare(right.id)
  );
}

function statusCounts(metrics: PerformanceMetricSnapshot[]): Record<BudgetStatus, number> {
  return metrics.reduce<Record<BudgetStatus, number>>(
    (acc, metric) => {
      acc[metric.status] += 1;
      return acc;
    },
    { passed: 0, warning: 0, failed: 0, not_measured: 0 }
  );
}

function notMeasuredPerformanceMetric(): PerformanceMetricSnapshot {
  return {
    id: "performance-not-collected",
    label: "Performance audit",
    value: null,
    unit: "count",
    status: "not_measured",
    reliability: "not_measured",
    evidence: ["Performance audit was not collected for this report."]
  };
}

function normalizeQualityGateStatus(status: string | undefined): "passed" | "failed" | "unknown" {
  if (status === "passed" || status === "failed") {
    return status;
  }
  return "unknown";
}

function readinessFromFixClass(fixClass: FixClass): AutomationReadiness {
  if (fixClass === "safe_auto_fix") return "auto";
  if (fixClass === "approval_required") return "approval_required";
  return "manual";
}

function impactFromSeverity(severity: Severity): ReportDashboardQueueItem["expectedImpact"] {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function fallbackOwner(category: FindingCategory | undefined): ActionOwner {
  if (category === "policy") return "policy";
  if (category === "security") return "security";
  if (category === "performance_seo") return "frontend";
  if (category === "structured_data" || category === "api_auth_mcp" || category === "protocol_discovery") {
    return "backend";
  }
  if (category === "content_seo" || category === "onpage_seo" || category === "media_seo") return "content";
  if (category === "agent_readiness") return "agent-platform";
  return "seo";
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return sortedUnique(values.filter((value): value is string => Boolean(value && value.trim().length > 0)));
}

function sortedUnique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function hostname(input: string): string {
  try {
    return new URL(input).hostname;
  } catch {
    return "";
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

export type SiteType =
  | "auto"
  | "content"
  | "docs"
  | "api"
  | "app"
  | "commerce"
  | "local-business"
  | "publisher"
  | "marketplace"
  | "mixed";

export type RenderJsMode = "auto" | "never" | "always";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "passed" | "not_applicable" | "warning";
export type FindingCategory =
  | "technical_seo"
  | "crawlability"
  | "indexability"
  | "onpage_seo"
  | "content_seo"
  | "internal_linking"
  | "structured_data"
  | "javascript_seo"
  | "media_seo"
  | "performance_seo"
  | "accessibility"
  | "international_seo"
  | "local_seo"
  | "ecommerce_seo"
  | "agent_readiness"
  | "protocol_discovery"
  | "api_auth_mcp"
  | "security"
  | "policy";

export type EvidenceType =
  | "http_status"
  | "header"
  | "body_excerpt"
  | "file"
  | "json_path"
  | "xml_path"
  | "html_selector"
  | "dns_record"
  | "screenshot"
  | "command_output"
  | "raw_render_diff"
  | "crawl_graph"
  | "schema_parse_error"
  | "performance_metric"
  | "resource_timing"
  | "browser_console"
  | "browser_metric"
  | "browser_runtime"
  | "field_metric"
  | "search_console"
  | "repo_file"
  | "tech_stack_signal"
  | "route_template"
  | "baseline";

export type FixClass = "safe_auto_fix" | "approval_required" | "manual_strategy" | "not_applicable";
export type Effort = "small" | "medium" | "large";
export type Risk = "low" | "medium" | "high";
export type ValidationStatus = "passed" | "failed" | "warning" | "not_applicable";
export type ScoreLevel = "excellent" | "strong" | "medium" | "weak" | "critical";
export type ActionOwner =
  "frontend" | "content" | "backend" | "infra" | "policy" | "security" | "seo" | "agent-platform" | "unknown";
export type AutomationReadiness = "auto" | "repo_assisted" | "manual" | "approval_required";
export type MeasurementReliability = "field" | "browser_lab" | "fetch_lab" | "heuristic" | "not_measured";
export type BudgetStatus = "passed" | "warning" | "failed" | "not_measured";
export type FieldDataProvider = "crux" | "gsc" | "rum";
export type FieldDataStatus = "disabled" | "ok" | "partial" | "unavailable" | "failed";
export type AuditOutputMode = "auto" | "explicit";
export type AgentReviewStatus = "pending" | "complete" | "invalid";
export type AgentReviewReviewer = "pending" | "agent" | "fixture";
export type AgentReviewApprovalState = "not_required" | "approval_required";
export type AgentReviewCategory =
  FindingCategory | "strategic" | "copywriting" | "search_intent" | "agent_skills";

export interface ScanPolicy {
  search: "yes" | "no" | "neutral";
  aiInput: "yes" | "no" | "ask";
  aiTrain: "yes" | "no" | "ask";
  mcpMutations: "disabled" | "approval-required" | "enabled";
  commerceActions: "disabled" | "approval-required" | "enabled";
}

export interface PerformanceBudget {
  lcpMs?: number;
  inpMs?: number;
  cls?: number;
  ttfbMs?: number;
  documentFetchMs?: number;
  totalJsKb?: number;
  thirdPartyJsKb?: number;
  totalCssKb?: number;
  imageBytesKb?: number;
  renderBlockingRequests?: number;
  totalRequests?: number;
}

export interface SuppressionRule {
  id: string;
  findingId: string;
  urlPattern?: string;
  reason: string;
  owner?: string;
  expiresAt?: string;
}

export interface ScanConfig {
  url: string;
  siteType: SiteType;
  maxPages: number;
  maxDepth: number;
  renderJs: RenderJsMode;
  respectRobotsTxt: boolean;
  userAgent: string;
  timeoutMs: number;
  concurrency: number;
  includeScreenshots: boolean;
  includeCoreWebVitals: boolean;
  includeBrowserEvidence: boolean;
  includeAccessibility: boolean;
  includeCommerce: boolean;
  includeInternationalSeo: boolean;
  includeLocalSeo: boolean;
  includeExperimentalStandards: boolean;
  includeAgentReadiness: boolean;
  includeSearchIntegrations: boolean;
  fieldDataProviders: FieldDataProvider[];
  outputDir: string;
  auditRoot?: string;
  auditName?: string;
  auditSlug?: string;
  auditRunId?: string;
  auditOutputMode?: AuditOutputMode;
  policy: ScanPolicy;
  policyFile?: string;
  repoPath?: string;
  framework?: string;
  performanceRuns?: number;
  performanceBudgets?: PerformanceBudget;
  baselinePath?: string;
  suppressions?: SuppressionRule[];
  suppressionsFile?: string;
  gscSiteUrl?: string;
  gscDateStart?: string;
  gscDateEnd?: string;
  gscRowLimit?: number;
  gscInspectionLimit?: number;
  rumDataPath?: string;
  includeCruxHistory?: boolean;
  fieldDataUrlLimit?: number;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  url?: string;
  path?: string;
  status?: number;
  header?: string;
  selector?: string;
  value?: unknown;
  excerpt?: string;
  timestamp: string;
}

export interface RemediationOption {
  id: string;
  findingId: string;
  title: string;
  fixClass: FixClass;
  effort: Effort;
  risk: Risk;
  implementationPath: string;
  validation: string[];
  approvalReason?: string;
}

export interface FindingActionability {
  owner: ActionOwner;
  automationReadiness: AutomationReadiness;
  sourceLocations: string[];
  repoEvidence: string[];
  expectedImpact: "low" | "medium" | "high";
  nextStep: string;
  blockers: string[];
}

export interface Finding {
  id: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  status: FindingStatus;
  impact: string;
  rootCause: string;
  evidence: Evidence[];
  affectedUrls: string[];
  affectedTemplates: string[];
  recommendation: string;
  remediation: RemediationOption[];
  safeToAutoFix: boolean;
  approvalRequired: boolean;
  validation: string[];
  references?: string[];
  actionability?: FindingActionability;
}

export interface ScoreCategory {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  status: ScoreLevel;
  notes: string;
}

export interface Score {
  total: number;
  level: ScoreLevel;
  scores: {
    seo: number;
    agentReadiness: number;
    technicalHealth: number;
    contentQuality: number;
    performanceAccessibility: number;
    securityPolicy: number;
  };
  categories: ScoreCategory[];
}

export interface ReportDashboardQueueItem {
  id: string;
  findingId: string;
  title: string;
  severity: Severity;
  category: FindingCategory;
  owner: ActionOwner;
  automationReadiness: AutomationReadiness;
  fixClass: FixClass;
  effort: Effort;
  risk: Risk;
  expectedImpact: "low" | "medium" | "high";
  approvalRequired: boolean;
  safeToAutoFix: boolean;
  sourceCandidates: string[];
  affectedTemplates: string[];
  affectedUrls: string[];
  validationCommand: string;
  nextStep: string;
  instances: number;
  evidenceCount: number;
}

export interface ReportDashboardMatrixQuadrant {
  id: "quick_wins" | "major_projects" | "fill_ins" | "strategic_approvals";
  label: string;
  summary: string;
  items: ReportDashboardQueueItem[];
}

export interface ReportDashboardTemplateHeatmapItem {
  template: string;
  urlPattern: string | null;
  representativeUrl: string | null;
  pageCount: number;
  issueCount: number;
  criticalHighCount: number;
  findingIds: string[];
  sourceCandidates: string[];
  affectedUrls: string[];
  owners: ActionOwner[];
}

export interface ReportDashboardPerformanceSummary {
  statusCounts: Record<BudgetStatus, number>;
  metrics: PerformanceMetricSnapshot[];
  largestAssets: Array<{
    url: string;
    type: ResourceTimingSnapshot["type"];
    bytes: number;
    thirdParty: boolean;
    renderBlocking: boolean;
  }>;
  thirdParty: {
    requests: number;
    knownKb: number;
    hosts: string[];
  };
  renderBlocking: Array<{
    url: string;
    type: ResourceTimingSnapshot["type"];
    bytes: number | null;
    totalMs: number | null;
  }>;
  timing: {
    runs: number;
    minDocumentFetchMs: number | null;
    medianDocumentFetchMs: number | null;
    p95DocumentFetchMs: number | null;
    maxDocumentFetchMs: number | null;
  };
  browserEvidence: {
    status: BrowserEvidenceReport["status"];
    pagesVisited: number;
    consoleErrors: number;
    consoleWarnings: number;
    pageErrors: number;
    failedRequests: number;
    detectedFrameworks: string[];
    detectedBundlers: string[];
    hydrationRiskUrls: string[];
    browserMetricCoverage: BrowserEvidenceReport["summary"]["browserMetricCoverage"];
  };
  fieldData: {
    status: FieldDataReport["status"];
    providersRequested: FieldDataProvider[];
    providersAvailable: FieldDataProvider[];
    metricCoverage: FieldDataReport["summary"]["metricCoverage"];
    fieldOrigin: FieldDataReport["summary"]["origin"];
    searchConsole: FieldDataReport["summary"]["searchConsole"];
    rum: FieldDataReport["summary"]["rum"];
    limitations: string[];
  };
  limitations: string[];
}

export interface ReportDashboardBaselineSummary {
  status: BaselineComparison["status"];
  scoreDelta: number | null;
  newFindingGroups: string[];
  resolvedFindingGroups: string[];
  recurringFindingGroups: string[];
  unchangedFindingGroups: string[];
  performanceDeltas: Record<string, number>;
  notes: string[];
}

export interface ReportDashboardEvidenceStats {
  evidenceEntries: number;
  findings: number;
  groupedFindings: number;
  pages: number;
  resources: number;
  validationCommands: number;
  approvalRequired: number;
  safeAutoFixes: number;
}

export interface AgentReviewEvidenceLink {
  evidenceId?: string;
  findingId?: string;
  url?: string;
  sourceArtifact?: string;
  note: string;
}

export interface AgentReviewFinding {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  category: AgentReviewCategory;
  evidence: AgentReviewEvidenceLink[];
  recommendation: string;
  approvalState: AgentReviewApprovalState;
  validation: string[];
}

export interface AgentCopyRecommendation {
  id: string;
  target:
    | "title"
    | "meta_description"
    | "heading"
    | "cta"
    | "alt_text"
    | "section_copy"
    | "content_brief"
    | "other";
  current?: string | null;
  proposed: string;
  rationale: string;
  affectedUrls: string[];
  evidence: AgentReviewEvidenceLink[];
  approvalState: AgentReviewApprovalState;
  safeToApply: boolean;
}

export interface SearchIntentReview {
  status: AgentReviewStatus;
  summary: string;
  primaryIntent: string;
  secondaryIntents: string[];
  contentGaps: string[];
  evidence: AgentReviewEvidenceLink[];
}

export interface AgentSkillsReview {
  status: AgentReviewStatus;
  summary: string;
  taskSimulations: Array<{
    task: string;
    outcome: "pass" | "partial" | "fail";
    evidence: AgentReviewEvidenceLink[];
    recommendation: string;
  }>;
  blockers: string[];
  evidence: AgentReviewEvidenceLink[];
}

export interface FinalAuditNarrative {
  status: AgentReviewStatus;
  executiveSummary: string;
  finalAuditMarkdown: string;
  topPriorities: string[];
  evidence: AgentReviewEvidenceLink[];
}

export interface AgentReview {
  generatedAt: string;
  status: AgentReviewStatus;
  reviewer: AgentReviewReviewer;
  targetUrl: string;
  sourceArtifacts: string[];
  executiveSummary: string;
  finalAudit: FinalAuditNarrative;
  searchIntent: SearchIntentReview;
  agentSkills: AgentSkillsReview;
  strategicFindings: AgentReviewFinding[];
  copyRecommendations: AgentCopyRecommendation[];
  limitations: string[];
}

export interface AgentReviewInput {
  generatedAt: string;
  status: "ready";
  targetUrl: string;
  reportContractVersion: string;
  sourceArtifacts: string[];
  score: Score;
  findingCount: number;
  groupedFindingCount: number;
  topFindings: Array<{
    id: string;
    title: string;
    severity: Severity;
    category: FindingCategory;
    affectedUrls: string[];
    affectedTemplates: string[];
    evidenceIds: string[];
    recommendation: string;
    approvalRequired: boolean;
    safeToAutoFix: boolean;
  }>;
  nextBestFixes: ReportDashboardQueueItem[];
  implementationQueue: ReportDashboardQueueItem[];
  approvalQueue: ReportDashboardQueueItem[];
  templateHeatmap: ReportDashboardTemplateHeatmapItem[];
  performanceSummary: ReportDashboardPerformanceSummary;
  baselineSummary: ReportDashboardBaselineSummary;
  evidenceStats: ReportDashboardEvidenceStats;
  siteIntelligence: {
    techStack?: TechStackFingerprint;
    repo?: RepoAnalysis;
    routeTemplates: RouteTemplateCluster[];
    browserEvidence?: BrowserEvidenceReport;
    fieldData?: FieldDataReport;
    performance?: PerformanceAudit;
  };
  instructions: string[];
}

export interface ReportDashboardAgentReviewSummary {
  status: AgentReviewStatus;
  reviewer: AgentReviewReviewer;
  executiveSummaryAvailable: boolean;
  finalAuditAvailable: boolean;
  searchIntentStatus: AgentReviewStatus;
  agentSkillsStatus: AgentReviewStatus;
  strategicFindings: number;
  copyRecommendations: number;
  approvalRequiredCopy: number;
  limitations: string[];
}

export interface ReportDashboard {
  generatedAt: string;
  targetUrl: string;
  score: Score;
  validationOk: boolean;
  qualityGateStatus: "passed" | "failed" | "unknown";
  executiveSummary: {
    topRisks: ReportDashboardQueueItem[];
    topWins: ReportDashboardQueueItem[];
    remainingApprovals: number;
    validationState: "passed" | "failed";
    qualityGateStatus: "passed" | "failed" | "unknown";
  };
  agentReview: ReportDashboardAgentReviewSummary;
  filters: {
    owners: ActionOwner[];
    fixClasses: FixClass[];
    automationReadiness: AutomationReadiness[];
    approvalStates: Array<"approval_required" | "no_approval_required">;
  };
  nextBestFixes: ReportDashboardQueueItem[];
  implementationQueue: ReportDashboardQueueItem[];
  approvalQueue: ReportDashboardQueueItem[];
  impactEffortMatrix: ReportDashboardMatrixQuadrant[];
  templateHeatmap: ReportDashboardTemplateHeatmapItem[];
  performanceSummary: ReportDashboardPerformanceSummary;
  baselineSummary: ReportDashboardBaselineSummary;
  evidenceStats: ReportDashboardEvidenceStats;
}

export interface RemediationPhase {
  id: string;
  title: string;
  summary: string;
  items: RemediationOption[];
}

export interface UserDecision {
  id: string;
  title: string;
  reason: string;
  options: string[];
  default: string;
}

export interface RemediationPlan {
  phases: RemediationPhase[];
  safeFixes: RemediationOption[];
  approvalRequired: RemediationOption[];
  manualRecommendations: RemediationOption[];
  userDecisions: UserDecision[];
}

export interface ValidationCheck {
  id: string;
  title: string;
  status: ValidationStatus;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ValidationResult {
  ok: boolean;
  generatedAt: string;
  checks: ValidationCheck[];
}

export interface EndpointProbe {
  path: string;
  url: string;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  bodyExcerpt: string;
  headers: Record<string, string>;
  error?: string;
  timing?: FetchTimingSnapshot;
}

export interface ImageSnapshot {
  src: string;
  alt: string | null;
  hasWidth: boolean;
  hasHeight: boolean;
}

export interface HeadingSnapshot {
  level: number;
  text: string;
}

export interface JsonLdSnapshot {
  raw: string;
  parsed: unknown | null;
  parseError: string | null;
  types: string[];
}

export interface PageSnapshot {
  url: string;
  status: number;
  finalUrl: string;
  contentType: string;
  headers: Record<string, string>;
  title: string | null;
  metaDescription: string | null;
  robotsMeta: string | null;
  canonical: string | null;
  hreflang: string[];
  lang: string | null;
  viewport: string | null;
  headings: HeadingSnapshot[];
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  images: ImageSnapshot[];
  jsonLd: JsonLdSnapshot[];
  openGraph: Record<string, string>;
  twitterCards: Record<string, string>;
  hasSkipLink: boolean;
  forms: number;
  bodyExcerpt: string;
  timing?: FetchTimingSnapshot;
}

export interface CrawlGraphNode {
  url: string;
  depth: number;
  status: number | null;
}

export interface CrawlGraphEdge {
  from: string;
  to: string;
}

export interface CrawlGraph {
  nodes: CrawlGraphNode[];
  edges: CrawlGraphEdge[];
}

export interface FetchTimingSnapshot {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  totalMs: number;
  bodyBytes: number;
  contentType: string | null;
  run: number;
  profile: "default" | "mobile" | "desktop" | "cold" | "warm";
  error?: string;
}

export interface ResourceTimingSnapshot {
  url: string;
  type: "script" | "stylesheet" | "image" | "font" | "preload" | "document" | "other";
  sameOrigin: boolean;
  thirdParty: boolean;
  renderBlocking: boolean;
  async: boolean;
  defer: boolean;
  lazy: boolean;
  discoveredIn: "head" | "body" | "unknown";
  bytes?: number;
  status?: number | null;
  totalMs?: number;
}

export interface PerformanceMetricSnapshot {
  id: string;
  label: string;
  value: number | null;
  unit: "ms" | "kb" | "count" | "score" | "ratio";
  budget?: number;
  status: BudgetStatus;
  reliability: MeasurementReliability;
  evidence: string[];
}

export interface PerformanceProfile {
  id: string;
  label: string;
  runs: number;
  reliability: MeasurementReliability;
}

export interface PerformanceAudit {
  generatedAt: string;
  budgets: PerformanceBudget;
  profiles: PerformanceProfile[];
  metrics: PerformanceMetricSnapshot[];
  resources: ResourceTimingSnapshot[];
  fetchTimings: FetchTimingSnapshot[];
  summary: {
    totalRequests: number;
    sameOriginRequests: number;
    thirdPartyRequests: number;
    renderBlockingRequests: number;
    totalJsKb: number;
    thirdPartyJsKb: number;
    totalCssKb: number;
    imageBytesKb: number;
    medianDocumentFetchMs: number | null;
    p95DocumentFetchMs: number | null;
  };
  limitations: string[];
}

export interface BrowserConsoleEntry {
  type: "debug" | "info" | "log" | "warning" | "error";
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface BrowserRequestFailure {
  url: string;
  method: string;
  resourceType: string;
  failureText: string;
}

export interface BrowserResourceTiming {
  name: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  renderBlockingStatus?: string;
}

export interface BrowserRenderedSnapshot {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1: string | null;
  wordCount: number;
  internalLinks: number;
  jsonLdTypes: string[];
}

export interface BrowserRuntimeEvidence {
  frameworks: string[];
  bundlers: string[];
  globals: string[];
  markers: Record<string, boolean>;
}

export interface BrowserMetricEvidence {
  domContentLoadedMs: number | null;
  loadMs: number | null;
  ttfbMs: number | null;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  interactionToNextPaintMs: number | null;
  longTasks: number;
  longTaskTotalMs: number;
}

export interface BrowserPageEvidence {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string | null;
  rendered: BrowserRenderedSnapshot;
  rawComparison: {
    changedFields: string[];
    rawWordCount: number | null;
    renderedWordCount: number;
    risk: "low" | "review_recommended";
  };
  console: {
    errors: BrowserConsoleEntry[];
    warnings: BrowserConsoleEntry[];
  };
  pageErrors: string[];
  failedRequests: BrowserRequestFailure[];
  resources: BrowserResourceTiming[];
  runtime: BrowserRuntimeEvidence;
  metrics: BrowserMetricEvidence;
  limitations: string[];
}

export interface BrowserEvidenceReport {
  generatedAt: string;
  status: "disabled" | "ok" | "unavailable" | "failed";
  requested: boolean;
  pages: BrowserPageEvidence[];
  summary: {
    pagesVisited: number;
    consoleErrors: number;
    consoleWarnings: number;
    pageErrors: number;
    failedRequests: number;
    browserMetricCoverage: {
      ttfb: number;
      fcp: number;
      lcp: number;
      cls: number;
      inp: number;
    };
    detectedFrameworks: string[];
    detectedBundlers: string[];
    hydrationRiskUrls: string[];
  };
  limitations: string[];
}

export type CruxFormFactor = "ALL" | "PHONE" | "DESKTOP" | "TABLET";
export type CruxScope = "origin" | "url";
export type CruxMetricName =
  | "largest_contentful_paint"
  | "interaction_to_next_paint"
  | "cumulative_layout_shift"
  | "first_contentful_paint"
  | "experimental_time_to_first_byte";

export interface CruxMetricHistogramBin {
  start: number | string | null;
  end: number | string | null;
  density: number;
}

export interface CruxMetricResult {
  metric: CruxMetricName;
  p75: number | null;
  unit: "ms" | "score";
  goodDensity: number | null;
  needsImprovementDensity: number | null;
  poorDensity: number | null;
  histogram: CruxMetricHistogramBin[];
}

export interface CruxRecordEvidence {
  scope: CruxScope;
  url: string;
  formFactor: CruxFormFactor;
  status: "ok" | "not_found" | "failed";
  collectionPeriod?: {
    firstDate: string;
    lastDate: string;
  };
  normalizedUrl?: string;
  metrics: CruxMetricResult[];
  error?: string;
}

export interface CruxHistoryMetricPoint {
  date: string;
  metric: CruxMetricName;
  p75: number | null;
  goodDensity: number | null;
  needsImprovementDensity: number | null;
  poorDensity: number | null;
}

export interface CruxHistoryRecord {
  scope: CruxScope;
  url: string;
  formFactor: CruxFormFactor;
  status: "ok" | "not_found" | "failed" | "disabled";
  points: CruxHistoryMetricPoint[];
  error?: string;
}

export interface CruxFieldDataReport {
  generatedAt: string;
  status: FieldDataStatus;
  requested: boolean;
  source: "crux_api";
  origin: string;
  formFactors: CruxFormFactor[];
  records: CruxRecordEvidence[];
  history: CruxHistoryRecord[];
  summary: {
    recordsOk: number;
    recordsNotFound: number;
    recordsFailed: number;
    originP75: Partial<Record<CruxMetricName, number>>;
    phoneP75: Partial<Record<CruxMetricName, number>>;
    desktopP75: Partial<Record<CruxMetricName, number>>;
  };
  limitations: string[];
}

export interface GscSearchAnalyticsRow {
  keys: string[];
  page?: string;
  query?: string;
  device?: string;
  country?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscUrlInspectionResult {
  inspectionUrl: string;
  status: "ok" | "failed";
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  referringUrls: string[];
  rawResultAvailable: boolean;
  error?: string;
}

export interface SearchConsoleReport {
  generatedAt: string;
  status: FieldDataStatus;
  requested: boolean;
  siteUrl?: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  searchAnalytics: {
    status: FieldDataStatus;
    dimensions: string[];
    rowLimit: number;
    rows: GscSearchAnalyticsRow[];
    totals: {
      clicks: number;
      impressions: number;
      averageCtr: number | null;
      averagePosition: number | null;
    };
    error?: string;
  };
  urlInspection: {
    status: FieldDataStatus;
    inspected: number;
    limit: number;
    results: GscUrlInspectionResult[];
    error?: string;
  };
  summary: {
    topPages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>;
    topQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>;
    indexedUrls: number;
    nonIndexedUrls: number;
  };
  limitations: string[];
}

export interface RumVitalsMetric {
  metric: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  p75: number;
  unit: "ms" | "score";
  samples: number | null;
  goodRate: number | null;
  url?: string;
  route?: string;
  device?: string;
}

export interface RumVitalsReport {
  generatedAt: string;
  status: FieldDataStatus;
  requested: boolean;
  sourcePath?: string;
  metrics: RumVitalsMetric[];
  summary: {
    metricCount: number;
    sampleCount: number | null;
    p75: Partial<Record<RumVitalsMetric["metric"], number>>;
    worstMetrics: RumVitalsMetric[];
  };
  limitations: string[];
}

export interface FieldDataReport {
  generatedAt: string;
  status: FieldDataStatus;
  requested: boolean;
  providersRequested: FieldDataProvider[];
  crux?: CruxFieldDataReport;
  searchConsole?: SearchConsoleReport;
  rum?: RumVitalsReport;
  summary: {
    providersAvailable: FieldDataProvider[];
    metricCoverage: {
      crux: Partial<Record<CruxMetricName, boolean>>;
      rum: Partial<Record<RumVitalsMetric["metric"], boolean>>;
      gsc: {
        searchAnalytics: boolean;
        urlInspection: boolean;
      };
    };
    origin: {
      lcpP75Ms: number | null;
      inpP75Ms: number | null;
      clsP75: number | null;
      ttfbP75Ms: number | null;
    };
    searchConsole: {
      clicks: number | null;
      impressions: number | null;
      inspectedUrls: number;
      indexedUrls: number;
      nonIndexedUrls: number;
    };
    rum: {
      lcpP75Ms: number | null;
      inpP75Ms: number | null;
      clsP75: number | null;
      samples: number | null;
    };
  };
  limitations: string[];
}

export interface TechStackSignal {
  category:
    | "framework"
    | "hosting"
    | "cdn"
    | "cms"
    | "analytics"
    | "bundler"
    | "rendering"
    | "image"
    | "sitemap"
    | "runtime"
    | "other";
  name: string;
  confidence: number;
  source: "headers" | "html" | "asset_path" | "endpoint" | "repo" | "dns" | "inference" | "browser";
  evidence: string;
}

export interface TechStackFingerprint {
  generatedAt: string;
  framework: string;
  hosting: string[];
  cdn: string[];
  cms: string[];
  analytics: string[];
  bundler: string[];
  rendering: string[];
  imagePipeline: string[];
  signals: TechStackSignal[];
  confidence: number;
}

export interface RepoSourceFile {
  path: string;
  kind:
    | "package"
    | "framework_config"
    | "route"
    | "layout"
    | "metadata"
    | "sitemap"
    | "robots"
    | "static_asset"
    | "deployment"
    | "content"
    | "test"
    | "other";
  confidence: number;
  reason: string;
}

export interface RepoAnalysis {
  generatedAt: string;
  status: "not_configured" | "ok" | "partial" | "error";
  path?: string;
  packageManager?: string;
  frameworks: string[];
  dependencies: string[];
  scripts: string[];
  sourceFiles: RepoSourceFile[];
  routeFiles: RepoSourceFile[];
  staticFiles: RepoSourceFile[];
  deploymentFiles: RepoSourceFile[];
  seoFiles: RepoSourceFile[];
  confidence: number;
  limitations: string[];
}

export interface RouteTemplateCluster {
  id: string;
  label: string;
  urlPattern: string;
  representativeUrl: string;
  urls: string[];
  pageCount: number;
  signals: string[];
  sourceCandidates: string[];
}

export interface SuppressionMatch {
  suppressionId: string;
  findingId: string;
  matchedUrls: string[];
  reason: string;
}

export interface SuppressionReport {
  generatedAt: string;
  suppressedCount: number;
  active: SuppressionRule[];
  expired: SuppressionRule[];
  unmatched: SuppressionRule[];
  matches: SuppressionMatch[];
}

export interface BaselineComparison {
  generatedAt: string;
  status: "not_configured" | "ok" | "missing" | "invalid";
  baselinePath?: string;
  scoreDelta?: number;
  newFindingGroups: string[];
  resolvedFindingGroups: string[];
  recurringFindingGroups: string[];
  performanceDeltas: Record<string, number>;
  notes: string[];
}

export interface DiscoveryResult {
  endpoints: Record<string, EndpointProbe>;
  robotsTxt: EndpointProbe | null;
  sitemapXml: EndpointProbe | null;
  sitemapUrls: string[];
  llmsTxt: EndpointProbe | null;
  markdownNegotiation: EndpointProbe | null;
}

export interface ScanResult {
  scanId: string;
  startedAt: string;
  completedAt: string;
  config: ScanConfig;
  siteType: SiteType;
  framework: string;
  discovery: DiscoveryResult;
  pages: PageSnapshot[];
  evidence: Evidence[];
  crawlGraph: CrawlGraph;
  techStack?: TechStackFingerprint;
  repo?: RepoAnalysis;
  performance?: PerformanceAudit;
  routeTemplates?: RouteTemplateCluster[];
  browserEvidence?: BrowserEvidenceReport;
  fieldData?: FieldDataReport;
}

export interface ReportBundle {
  scan: ScanResult;
  findings: Finding[];
  score: Score;
  remediationPlan: RemediationPlan;
  validation: ValidationResult;
  patchDiff: string;
}

export interface ScanSummary {
  scanId: string;
  reportPath: string;
  score: Score;
  findingCounts: Record<Severity, number>;
}

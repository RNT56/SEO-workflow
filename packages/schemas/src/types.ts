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
  includeAccessibility: boolean;
  includeCommerce: boolean;
  includeInternationalSeo: boolean;
  includeLocalSeo: boolean;
  includeExperimentalStandards: boolean;
  includeAgentReadiness: boolean;
  includeSearchIntegrations: boolean;
  outputDir: string;
  policy: ScanPolicy;
  policyFile?: string;
  repoPath?: string;
  framework?: string;
  performanceRuns?: number;
  performanceBudgets?: PerformanceBudget;
  baselinePath?: string;
  suppressions?: SuppressionRule[];
  suppressionsFile?: string;
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
  source: "headers" | "html" | "asset_path" | "endpoint" | "repo" | "dns" | "inference";
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

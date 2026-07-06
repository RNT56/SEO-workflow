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
  | "schema_parse_error";

export type FixClass = "safe_auto_fix" | "approval_required" | "manual_strategy" | "not_applicable";
export type Effort = "small" | "medium" | "large";
export type Risk = "low" | "medium" | "high";
export type ValidationStatus = "passed" | "failed" | "warning" | "not_applicable";
export type ScoreLevel = "excellent" | "strong" | "medium" | "weak" | "critical";

export interface ScanPolicy {
  search: "yes" | "no" | "neutral";
  aiInput: "yes" | "no" | "ask";
  aiTrain: "yes" | "no" | "ask";
  mcpMutations: "disabled" | "approval-required" | "enabled";
  commerceActions: "disabled" | "approval-required" | "enabled";
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

import type {
  ActionOwner,
  AutomationReadiness,
  Evidence,
  Finding,
  FindingCategory,
  PageSnapshot,
  RemediationOption,
  RepoSourceFile,
  RuleEvaluation,
  ScanResult,
  Severity
} from "@seo-polish/schemas";
import { enforceApprovalForFinding, findPrivateReferences, isPrivateUrl } from "@seo-polish/security";
import { getRule, RULE_CATALOG } from "./catalog.js";

interface FindingInput {
  id: string;
  title: string;
  severity?: Severity;
  category?: FindingCategory;
  confidence: number;
  evidence: Evidence[];
  affectedUrls?: string[];
  affectedTemplates?: string[];
  impact: string;
  rootCause: string;
  recommendation: string;
  implementationPath: string;
  validation: string[];
  safeToAutoFix?: boolean;
  approvalRequired?: boolean;
}

export function evaluateRules(scan: ScanResult): Finding[] {
  const findings: Finding[] = [];
  const add = (input: FindingInput): void => {
    const rule = getRule(input.id);
    const remediation: RemediationOption = {
      id: `${input.id}-FIX`,
      findingId: input.id,
      title: input.recommendation,
      fixClass: input.approvalRequired
        ? "approval_required"
        : input.safeToAutoFix
          ? "safe_auto_fix"
          : "manual_strategy",
      effort: input.safeToAutoFix ? "small" : "medium",
      risk: input.approvalRequired ? "high" : input.safeToAutoFix ? "low" : "medium",
      implementationPath: input.implementationPath,
      validation: input.validation
    };

    const finding: Finding = {
      id: input.id,
      title: input.title,
      category: input.category ?? rule.category,
      severity: input.severity ?? rule.defaultSeverity,
      confidence: input.confidence,
      status: "open",
      impact: input.impact,
      rootCause: input.rootCause,
      evidence: input.evidence,
      affectedUrls: input.affectedUrls ?? [],
      affectedTemplates: input.affectedTemplates ?? [],
      recommendation: input.recommendation,
      remediation: [remediation],
      safeToAutoFix: input.safeToAutoFix ?? false,
      approvalRequired: input.approvalRequired ?? false,
      validation: input.validation,
      references: [`standard:${rule.standard}`]
    };

    const enforced = enforceApprovalForFinding(finding);
    findings.push({
      ...enforced,
      actionability: buildActionability(enforced, scan)
    });
  };

  const endpointEvidence = endpointEvidenceByPath(scan);
  const robots = scan.discovery.robotsTxt;
  const sitemap = scan.discovery.sitemapXml;
  const llms = scan.discovery.llmsTxt;
  const robotsAnalysis = robots?.ok ? analyzeRobotsBody(robots.bodyExcerpt) : null;

  if (!robots?.ok) {
    add({
      id: "SEO-CRAWL-001",
      title: "robots.txt is missing or unreachable",
      confidence: 99,
      evidence: [endpointEvidence("/robots.txt")],
      affectedUrls: [new URL("/robots.txt", scan.config.url).toString()],
      impact: "Crawlers and agents cannot read the intended crawl policy or sitemap hints.",
      rootCause: "The standard robots.txt endpoint did not return a successful response.",
      recommendation:
        "Publish a robots.txt file with public crawl defaults, private path blocks and a Sitemap directive.",
      implementationPath:
        "Create robots.txt at the public root and include private Disallow rules plus the canonical sitemap URL.",
      validation: ["seo-polish validate --check report", "curl -fsS https://example.com/robots.txt"],
      safeToAutoFix: true
    });
  } else if (/disallow:\s*\/\s*$/im.test(robots.bodyExcerpt)) {
    add({
      id: "SEO-CRAWL-003",
      title: "robots.txt blocks the whole public site",
      severity: "critical",
      confidence: 98,
      evidence: [endpointEvidence("/robots.txt")],
      affectedUrls: [scan.config.url],
      impact: "Search crawlers can be blocked from indexing important public pages.",
      rootCause: "robots.txt contains a Disallow: / directive for the wildcard user agent.",
      recommendation: "Review and replace the blanket block with precise private path blocks.",
      implementationPath: "Update robots.txt after an explicit owner decision on crawl policy.",
      validation: ["seo-polish validate --check seo", "Confirm important public pages are not blocked."],
      approvalRequired: true
    });
  }

  if (!sitemap?.ok) {
    add({
      id: "SEO-SITEMAP-001",
      title: "sitemap.xml is missing or unreachable",
      confidence: 96,
      evidence: [endpointEvidence("/sitemap.xml")],
      affectedUrls: [new URL("/sitemap.xml", scan.config.url).toString()],
      impact: "Search engines and agents lose a canonical inventory of public pages.",
      rootCause: "No successful sitemap endpoint was discovered at sitemap.xml or sitemap_index.xml.",
      recommendation: "Publish a valid XML sitemap with canonical public URLs only.",
      implementationPath: "Generate sitemap.xml from canonical public routes and link it in robots.txt.",
      validation: [
        "seo-polish validate --check sitemap",
        "seo-polish report lint ./seo-polish-report --strict"
      ],
      safeToAutoFix: true
    });
  } else {
    if (scan.discovery.sitemapUrls.length === 0) {
      add({
        id: "SEO-SITEMAP-002",
        title: "sitemap.xml does not expose canonical URLs",
        confidence: 90,
        evidence: [endpointEvidence(sitemap.path)],
        affectedUrls: [sitemap.url],
        impact: "The sitemap cannot help crawlers discover canonical public URLs.",
        rootCause: "The sitemap response is empty or malformed.",
        recommendation: "Emit valid XML with urlset or sitemapindex and loc entries.",
        implementationPath: "Fix the sitemap generator and re-run report linting.",
        validation: ["seo-polish validate --check sitemap"],
        safeToAutoFix: false
      });
    }

    const privateSitemapUrls = [
      ...new Set([
        ...scan.discovery.sitemapUrls.filter((url) => isPrivateUrl(url)),
        ...findPrivateReferences(sitemap.bodyExcerpt)
      ])
    ];
    if (privateSitemapUrls.length > 0) {
      add({
        id: "SEO-SITEMAP-008",
        title: "sitemap.xml exposes private URLs",
        severity: "critical",
        confidence: 99,
        evidence: [endpointEvidence(sitemap.path)],
        affectedUrls: privateSitemapUrls,
        impact: "Private, auth or payment routes can be disclosed through public discovery files.",
        rootCause: "The sitemap source includes private route patterns.",
        recommendation:
          "Filter admin, account, auth, checkout, token and internal API URLs from the sitemap.",
        implementationPath: "Update the sitemap generator to only emit canonical public pages.",
        validation: [
          "seo-polish validate --check security",
          "Confirm no private URLs remain in sitemap.xml."
        ],
        safeToAutoFix: false
      });
    }
  }

  if (robots?.ok && !/^\s*sitemap:/im.test(robots.bodyExcerpt)) {
    add({
      id: "SEO-CRAWL-004",
      title: "robots.txt does not link the sitemap",
      confidence: 95,
      evidence: [endpointEvidence("/robots.txt")],
      affectedUrls: [robots.url],
      impact: "Crawlers and agents lose a reliable sitemap discovery hint.",
      rootCause: "robots.txt has no Sitemap directive.",
      recommendation: "Add a Sitemap directive pointing to the canonical sitemap.xml URL.",
      implementationPath: "Append `Sitemap: <origin>/sitemap.xml` to robots.txt.",
      validation: ["seo-polish validate --check sitemap"],
      safeToAutoFix: true
    });
  }

  if (robots?.ok && robotsAnalysis && !robotsAnalysis.hasAiPolicySignal) {
    add({
      id: "AR-ROBOTS-004",
      title: "robots.txt does not state AI/content policy signals",
      severity: "info",
      confidence: 82,
      evidence: [endpointEvidence("/robots.txt")],
      affectedUrls: [robots.url],
      impact:
        "Agents and AI crawlers cannot distinguish owner-approved search, AI-input or AI-training policy.",
      rootCause: "No Content-Signal, ai-input, ai-train or known AI crawler policy signal was detected.",
      recommendation:
        "Add policy placeholders or owner-approved content-signal comments after explicit decision.",
      implementationPath: "Prepare robots.txt policy fields, but keep final AI policy values owner-approved.",
      validation: ["Review robots.txt policy comments before publishing."],
      approvalRequired: true
    });
  }

  if (robots?.ok && robotsAnalysis && !robotsAnalysis.hasPrivateDisallows) {
    add({
      id: "AR-ROBOTS-006",
      title: "robots.txt does not block common private areas",
      confidence: 90,
      evidence: [endpointEvidence("/robots.txt")],
      affectedUrls: [robots.url],
      affectedTemplates: ["robots.txt"],
      impact:
        "Agents may receive no explicit public signal to avoid admin, account, checkout or internal API paths.",
      rootCause: "No private-path Disallow directives were detected for the wildcard user agent.",
      recommendation: "Add Disallow rules for common private, auth, checkout and internal API paths.",
      implementationPath:
        "Append private-path Disallow entries to robots.txt without changing public crawl policy.",
      validation: ["seo-polish validate --check security"],
      safeToAutoFix: true
    });
  }

  for (const page of scan.pages) {
    evaluatePage(page, scan, add);
  }

  evaluateCrossPageRules(scan, add);
  evaluatePerformanceRules(scan, add);

  if (!llms?.ok) {
    add({
      id: "AR-LLMS-001",
      title: "llms.txt is missing",
      severity: scan.siteType === "docs" || scan.siteType === "api" ? "high" : "medium",
      confidence: 99,
      evidence: [endpointEvidence("/llms.txt")],
      affectedUrls: [new URL("/llms.txt", scan.config.url).toString()],
      impact: "AI agents do not have a concise, owner-authored entry point to canonical public content.",
      rootCause: "No successful llms.txt endpoint was found.",
      recommendation:
        "Publish llms.txt with canonical pages, sitemap, policy reference and recommended agent path.",
      implementationPath:
        "Create a root llms.txt file generated from the public sitemap and owner-approved policy fields.",
      validation: ["seo-polish validate --check agent-readiness"],
      safeToAutoFix: true
    });
  } else {
    if (llms.contentType && !/text\/plain|text\/markdown|text\/x-markdown/i.test(llms.contentType)) {
      add({
        id: "AR-LLMS-003",
        title: "llms.txt has an unexpected content type",
        confidence: 90,
        evidence: [endpointEvidence("/llms.txt")],
        affectedUrls: [llms.url],
        impact: "Agents may fail to parse the file consistently.",
        rootCause: "The llms.txt endpoint is not served as plain text or Markdown.",
        recommendation: "Serve llms.txt as text/plain or text/markdown.",
        implementationPath: "Adjust static hosting or route headers for llms.txt.",
        validation: ["curl -I https://example.com/llms.txt"],
        safeToAutoFix: true
      });
    }

    const privateRefs = findPrivateReferences(llms.bodyExcerpt);
    if (privateRefs.length > 0) {
      add({
        id: "AR-LLMS-008",
        title: "llms.txt exposes private references",
        severity: "critical",
        confidence: 98,
        evidence: [endpointEvidence("/llms.txt")],
        affectedUrls: privateRefs,
        impact: "Agents can be directed toward auth, private, checkout or token-bearing paths.",
        rootCause: "The public llms.txt content includes private route patterns or secret-looking values.",
        recommendation: "Remove private references and keep llms.txt limited to canonical public resources.",
        implementationPath: "Regenerate llms.txt from an allowlist of public canonical URLs.",
        validation: ["seo-polish validate --check security"],
        safeToAutoFix: false
      });
    }
  }

  const markdownProbe = scan.discovery.markdownNegotiation;
  if (!markdownProbe?.contentType || !/markdown|text\/plain/i.test(markdownProbe.contentType)) {
    add({
      id: "AR-MD-001",
      title: "Markdown negotiation is not available",
      confidence: 80,
      evidence: markdownProbe ? [toEvidence(markdownProbe, "markdown-negotiation")] : [endpointEvidence("/")],
      affectedUrls: [scan.config.url],
      impact: "Agents may need to parse full HTML instead of compact Markdown representations.",
      rootCause:
        "The site does not respond with Markdown or text content for Markdown-oriented Accept headers.",
      recommendation: "Add Markdown negotiation for documentation or content pages where practical.",
      implementationPath:
        "Route text/markdown Accept requests to canonical Markdown content or index.md fallbacks.",
      validation: ["curl -H 'Accept: text/markdown' https://example.com/"],
      safeToAutoFix: false
    });
  }

  discoveryJsonRule(
    scan,
    add,
    "/.well-known/agent-skills/index.json",
    "AR-SKILL-001",
    "AR-SKILL-002",
    "Agent Skills index"
  );
  discoveryJsonRule(scan, add, "/.well-known/mcp.json", "AR-MCP-001", "AR-MCP-002", "MCP discovery");
  discoveryJsonRule(scan, add, "/.well-known/api-catalog", "AR-API-001", "AR-API-002", "API Catalog");
  evaluateMcpSafety(scan, add);

  if (
    (scan.siteType === "api" || scan.siteType === "app") &&
    !scan.discovery.endpoints["/openapi.json"]?.ok &&
    !scan.discovery.endpoints["/swagger.json"]?.ok
  ) {
    add({
      id: "AR-API-003",
      title: "OpenAPI discovery is missing for API-like site",
      confidence: 85,
      evidence: [endpointEvidence("/openapi.json")],
      affectedUrls: [new URL("/openapi.json", scan.config.url).toString()],
      impact: "Agents and developers cannot discover typed API operations from the canonical origin.",
      rootCause: "The site appears API-like, but neither openapi.json nor swagger.json was found.",
      recommendation: "Publish OpenAPI metadata or link it from the API Catalog.",
      implementationPath: "Expose a stable OpenAPI document and reference it from .well-known/api-catalog.",
      validation: ["seo-polish validate --check agent-readiness"],
      safeToAutoFix: false
    });
  }

  if ((scan.siteType === "api" || scan.siteType === "app") && !scan.discovery.endpoints["/auth.md"]?.ok) {
    add({
      id: "AR-AUTH-001",
      title: "auth.md is not published for agent auth guidance",
      severity: "info",
      confidence: 80,
      evidence: [endpointEvidence("/auth.md")],
      affectedUrls: [new URL("/auth.md", scan.config.url).toString()],
      impact: "Agents lack owner-authored guidance for safe authentication and scope requests.",
      rootCause: "No auth.md endpoint was discovered.",
      recommendation: "Publish auth.md only after owner approval for supported flows and scopes.",
      implementationPath:
        "Draft auth.md with least-privilege rules and approval requirements before publication.",
      validation: ["Review auth.md manually before publishing."],
      approvalRequired: true
    });
  }

  if (
    (scan.siteType === "api" || scan.siteType === "app") &&
    !scan.discovery.endpoints["/.well-known/oauth-authorization-server"]?.ok
  ) {
    add({
      id: "AR-AUTH-002",
      title: "OAuth authorization server metadata is missing",
      severity: "info",
      confidence: 75,
      evidence: [endpointEvidence("/.well-known/oauth-authorization-server")],
      affectedUrls: [new URL("/.well-known/oauth-authorization-server", scan.config.url).toString()],
      affectedTemplates: ["auth discovery"],
      impact: "Agents cannot discover authorization endpoints from standard metadata.",
      rootCause: "The OAuth authorization server metadata endpoint was not published.",
      recommendation: "Publish OAuth metadata only if the site intentionally supports agent authentication.",
      implementationPath: "Document supported auth flows and expose metadata after owner approval.",
      validation: ["Review OAuth metadata and scopes before publishing."],
      approvalRequired: true
    });
  }

  if (
    (scan.siteType === "api" || scan.siteType === "app") &&
    !scan.discovery.endpoints["/.well-known/oauth-protected-resource"]?.ok
  ) {
    add({
      id: "AR-AUTH-003",
      title: "OAuth protected resource metadata is missing",
      severity: "info",
      confidence: 75,
      evidence: [endpointEvidence("/.well-known/oauth-protected-resource")],
      affectedUrls: [new URL("/.well-known/oauth-protected-resource", scan.config.url).toString()],
      affectedTemplates: ["auth discovery"],
      impact: "Agents cannot discover protected resource metadata and scope expectations.",
      rootCause: "The OAuth protected resource metadata endpoint was not published.",
      recommendation: "Publish protected resource metadata only when authenticated agent access is approved.",
      implementationPath: "Document scopes and resource metadata after owner approval.",
      validation: ["Review OAuth metadata and scopes before publishing."],
      approvalRequired: true
    });
  }

  if (scan.config.includeSearchIntegrations) {
    add({
      id: "SEO-SEARCH-001",
      title: "Google Search Console data was not imported",
      severity: "info",
      confidence: 70,
      evidence: [endpointEvidence("/")],
      affectedTemplates: ["search integration"],
      impact: "Crawler-observed findings cannot be reconciled with live search performance.",
      rootCause: "No Search Console connector data was provided to this scan.",
      recommendation:
        "Optionally import Search Console data and label it separately from crawler-observed evidence.",
      implementationPath: "Configure a Search Console integration in a future scan.",
      validation: ["Confirm imported data is clearly labeled in the report."],
      safeToAutoFix: false
    });
    add({
      id: "SEO-SEARCH-002",
      title: "Bing Webmaster Tools data was not imported",
      severity: "info",
      confidence: 70,
      evidence: [endpointEvidence("/")],
      affectedTemplates: ["search integration"],
      impact: "Crawler-observed findings cannot be reconciled with Bing indexing and crawl data.",
      rootCause: "No Bing Webmaster Tools connector data was provided to this scan.",
      recommendation: "Optionally import Bing data and label it separately from crawler-observed evidence.",
      implementationPath: "Configure a Bing Webmaster Tools integration in a future scan.",
      validation: ["Confirm imported data is clearly labeled in the report."],
      safeToAutoFix: false
    });
  }

  return findings;

  function endpointEvidenceByPath(currentScan: ScanResult): (path: string) => Evidence {
    return (path: string): Evidence => {
      const probe = currentScan.discovery.endpoints[path];
      if (probe) {
        return toEvidence(probe, `endpoint-${path.replace(/[^a-z0-9]+/gi, "-")}`);
      }
      return {
        id: `missing-${path.replace(/[^a-z0-9]+/gi, "-")}`,
        type: "http_status",
        url: new URL(path, currentScan.config.url).toString(),
        status: 0,
        value: { path, ok: false },
        timestamp: new Date().toISOString()
      };
    };
  }
}

export function evaluateRulesWithCoverage(scan: ScanResult): {
  findings: Finding[];
  evaluations: RuleEvaluation[];
} {
  const findings = evaluateRules(scan);
  const findingCounts = new Map<string, number>();
  for (const finding of findings) {
    findingCounts.set(finding.id, (findingCounts.get(finding.id) ?? 0) + 1);
  }

  const evaluations = RULE_CATALOG.map((rule): RuleEvaluation => {
    const applicability = ruleApplicability(rule.id, rule.category, scan);
    const findingCount = findingCounts.get(rule.id) ?? 0;
    if (!applicability.applicable) {
      return {
        ruleId: rule.id,
        category: rule.category,
        maturity: rule.maturity,
        status: "not_applicable",
        applicable: false,
        measured: false,
        findingCount: 0,
        reason: applicability.reason
      };
    }
    if (!rule.implemented) {
      return {
        ruleId: rule.id,
        category: rule.category,
        maturity: rule.maturity,
        status: "not_measured",
        applicable: true,
        measured: false,
        findingCount: 0,
        reason: "The rule is catalogued but its deterministic evaluator is not implemented yet."
      };
    }
    const unavailableReason = ruleMeasurementUnavailable(rule.id, scan);
    if (unavailableReason) {
      return {
        ruleId: rule.id,
        category: rule.category,
        maturity: rule.maturity,
        status: "not_measured",
        applicable: true,
        measured: false,
        findingCount: 0,
        reason: unavailableReason
      };
    }
    return {
      ruleId: rule.id,
      category: rule.category,
      maturity: rule.maturity,
      status: findingCount > 0 ? "failed" : "passed",
      applicable: true,
      measured: true,
      findingCount,
      reason:
        findingCount > 0
          ? `${findingCount} evidence-backed finding instance${findingCount === 1 ? "" : "s"} emitted.`
          : "The deterministic evaluator ran and emitted no finding."
    };
  });

  return { findings, evaluations };
}

function ruleMeasurementUnavailable(ruleId: string, scan: ScanResult): string | null {
  if (ruleId === "SEO-PERF-001") {
    const lcp = scan.performance?.metrics.find((metric) => metric.id === "lcp-ms");
    if (!lcp || lcp.status === "not_measured" || lcp.value === null) {
      return "LCP was not available from browser or field evidence and is not inferred from fetch timing.";
    }
  }
  return null;
}

function ruleApplicability(
  ruleId: string,
  category: FindingCategory,
  scan: ScanResult
): { applicable: boolean; reason: string } {
  if (ruleId.startsWith("AR-") && !scan.config.includeAgentReadiness) {
    return { applicable: false, reason: "Agent-readiness evaluation is disabled for this scan." };
  }
  if (ruleId.startsWith("SEO-SEARCH-") && !scan.config.includeSearchIntegrations) {
    return { applicable: false, reason: "Search-provider integration checks are disabled for this scan." };
  }
  if (category === "accessibility" && !scan.config.includeAccessibility) {
    return { applicable: false, reason: "Accessibility evaluation is disabled for this scan." };
  }
  if (category === "international_seo" && !scan.config.includeInternationalSeo) {
    return { applicable: false, reason: "International SEO evaluation is disabled for this scan." };
  }
  if (category === "local_seo") {
    const applicable = scan.config.includeLocalSeo && ["local-business", "mixed"].includes(scan.siteType);
    return {
      applicable,
      reason: applicable
        ? "The detected site type includes a local-business surface."
        : "The site is not classified as local or mixed."
    };
  }
  if (category === "ecommerce_seo") {
    const applicable =
      scan.config.includeCommerce && ["commerce", "marketplace", "mixed"].includes(scan.siteType);
    return {
      applicable,
      reason: applicable
        ? "The detected site type includes a commerce surface."
        : "The site is not classified as commerce, marketplace or mixed."
    };
  }
  if (
    ruleId === "SEO-PERF-001" &&
    !scan.config.includeCoreWebVitals &&
    scan.config.fieldDataProviders.length === 0
  ) {
    return {
      applicable: false,
      reason: "Core Web Vitals evidence was not requested; the metric is not inferred from fetch timing."
    };
  }
  return { applicable: true, reason: "The rule applies to this scan profile." };
}

function buildActionability(finding: Finding, scan: ScanResult): NonNullable<Finding["actionability"]> {
  const sourceFiles = sourceCandidatesForFinding(finding, scan);
  const owner = ownerForFinding(finding);
  const automationReadiness = readinessForFinding(finding, sourceFiles);
  const sourceLocations = sourceFiles.map((file) => file.path);
  return {
    owner,
    automationReadiness,
    sourceLocations,
    repoEvidence: sourceFiles.map((file) => `${file.path}: ${file.reason}`),
    expectedImpact: impactForSeverity(finding.severity),
    nextStep: nextStepForFinding(finding, sourceLocations),
    blockers: blockersForFinding(finding, scan, sourceLocations)
  };
}

function sourceCandidatesForFinding(finding: Finding, scan: ScanResult): RepoSourceFile[] {
  const repo = scan.repo;
  if (!repo || repo.status !== "ok") {
    return [];
  }
  const id = finding.id.toLowerCase();
  const category = finding.category;
  const all = repo.sourceFiles;

  if (id.includes("robots")) {
    return repo.seoFiles.filter((file) => file.kind === "robots").slice(0, 5);
  }
  if (id.includes("sitemap")) {
    return repo.seoFiles.filter((file) => file.kind === "sitemap").slice(0, 5);
  }
  if (id.includes("llms") || id.includes("mcp") || id.includes("api") || id.includes("auth")) {
    return all
      .filter((file) => /llms|mcp|api|auth|well-known|public/.test(file.path.toLowerCase()))
      .slice(0, 5);
  }
  if (
    category === "onpage_seo" ||
    category === "indexability" ||
    category === "structured_data" ||
    category === "international_seo" ||
    id.includes("schema") ||
    id.includes("canonical")
  ) {
    return [
      ...repo.seoFiles.filter((file) => file.kind === "metadata"),
      ...repo.routeFiles,
      ...all.filter((file) => /seo|metadata|head|layout|document/.test(file.path.toLowerCase()))
    ].slice(0, 8);
  }
  if (category === "content_seo" || category === "internal_linking") {
    return [...all.filter((file) => file.kind === "content"), ...repo.routeFiles].slice(0, 8);
  }
  if (category === "media_seo" || category === "accessibility") {
    return [...repo.routeFiles, ...repo.staticFiles].slice(0, 8);
  }
  if (category === "performance_seo" || category === "technical_seo") {
    return [
      ...repo.deploymentFiles,
      ...all.filter((file) => file.kind === "framework_config"),
      ...repo.routeFiles
    ].slice(0, 8);
  }
  if (category === "security" || category === "policy") {
    return [...repo.seoFiles, ...repo.deploymentFiles].slice(0, 8);
  }

  return repo.routeFiles.slice(0, 5);
}

function ownerForFinding(finding: Finding): ActionOwner {
  switch (finding.category) {
    case "content_seo":
    case "internal_linking":
    case "local_seo":
    case "ecommerce_seo":
      return "content";
    case "technical_seo":
    case "crawlability":
    case "performance_seo":
      return "infra";
    case "security":
      return "security";
    case "policy":
      return "policy";
    case "agent_readiness":
    case "protocol_discovery":
    case "api_auth_mcp":
      return "agent-platform";
    case "onpage_seo":
    case "indexability":
    case "structured_data":
    case "javascript_seo":
    case "media_seo":
    case "accessibility":
    case "international_seo":
      return "frontend";
    default:
      return "unknown";
  }
}

function readinessForFinding(finding: Finding, sourceFiles: RepoSourceFile[]): AutomationReadiness {
  if (finding.approvalRequired) {
    return "approval_required";
  }
  if (finding.safeToAutoFix && sourceFiles.length > 0) {
    return "repo_assisted";
  }
  if (finding.safeToAutoFix) {
    return "auto";
  }
  return sourceFiles.length > 0 ? "repo_assisted" : "manual";
}

function impactForSeverity(severity: Severity): "low" | "medium" | "high" {
  if (severity === "critical" || severity === "high") {
    return "high";
  }
  if (severity === "medium") {
    return "medium";
  }
  return "low";
}

function nextStepForFinding(finding: Finding, sourceLocations: string[]): string {
  if (finding.approvalRequired) {
    return "Get explicit owner approval, then apply the documented remediation and rerun validation.";
  }
  if (sourceLocations.length > 0) {
    return `Review the mapped source candidate${sourceLocations.length === 1 ? "" : "s"} and implement the remediation there.`;
  }
  return "Apply the remediation in the website source repo, then rerun the scan and report lint.";
}

function blockersForFinding(finding: Finding, scan: ScanResult, sourceLocations: string[]): string[] {
  const blockers: string[] = [];
  if (finding.approvalRequired) {
    blockers.push("owner approval required");
  }
  if (!scan.repo || scan.repo.status !== "ok") {
    blockers.push("website source repo not connected");
  } else if (sourceLocations.length === 0) {
    blockers.push("no confident source candidate found");
  }
  if (finding.evidence.length === 0) {
    blockers.push("missing evidence");
  }
  return blockers;
}

function evaluatePage(page: PageSnapshot, scan: ScanResult, add: (input: FindingInput) => void): void {
  const pageEvidence = (selector: string, value: unknown): Evidence => {
    const evidence: Evidence = {
      id: `${page.finalUrl.replace(/[^a-z0-9]+/gi, "-").slice(0, 48)}-${selector.replace(/[^a-z0-9]+/gi, "-")}`,
      type: "html_selector",
      url: page.finalUrl,
      selector,
      value,
      timestamp: new Date().toISOString()
    };
    scan.evidence.push(evidence);
    return evidence;
  };

  if ((page.redirectChain?.length ?? 0) > 2) {
    add({
      id: "SEO-TECH-002",
      title: "Redirect chain is too long",
      confidence: 99,
      evidence: [pageEvidence("response.redirect-chain", page.redirectChain)],
      affectedUrls: [page.url],
      impact:
        "Long redirect chains waste crawl budget, add latency and make canonical delivery less reliable.",
      rootCause: `The requested URL followed ${page.redirectChain?.length ?? 0} redirects before the final response.`,
      recommendation:
        "Point internal links and discovery files directly at the final canonical URL and collapse intermediate redirects.",
      implementationPath:
        "Update redirect configuration, internal links and sitemap URLs after confirming the intended final URL.",
      validation: ["curl -IL <url>", "seo-polish scan <url>"],
      safeToAutoFix: false
    });
  }

  if (page.status < 200 || page.status >= 400) {
    add({
      id: "SEO-TECH-001",
      title: `Page returned HTTP ${page.status}`,
      severity: page.status >= 500 ? "critical" : "high",
      confidence: 99,
      evidence: [pageEvidence("response.status", page.status)],
      affectedUrls: [page.finalUrl],
      impact: "Important pages with non-success statuses cannot reliably rank or serve agents.",
      rootCause: "The page response status is outside the successful 2xx/3xx range.",
      recommendation: "Fix the route or remove it from public discovery files.",
      implementationPath: "Repair the route handler, redirect target or sitemap source for this URL.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  if (!hasCacheHeader(page.headers)) {
    add({
      id: "SEO-PERF-010",
      title: "HTML response is missing cache headers",
      confidence: 78,
      evidence: [pageEvidence("headers.cache-control", page.headers["cache-control"] ?? null)],
      affectedUrls: [page.finalUrl],
      impact: "Missing cache guidance can increase repeat-load cost and weaken performance consistency.",
      rootCause: "No Cache-Control or Expires header was captured for the HTML response.",
      recommendation: "Set explicit cache policy for HTML and static assets according to deployment needs.",
      implementationPath: "Configure framework or edge response headers for public pages.",
      validation: ["curl -I https://example.com/"],
      safeToAutoFix: false
    });
  }

  if (!hasCompressionHeader(page.headers) && likelyCompressible(page)) {
    add({
      id: "SEO-PERF-011",
      title: "Compressible HTML response has no compression header",
      confidence: 70,
      evidence: [pageEvidence("headers.content-encoding", page.headers["content-encoding"] ?? null)],
      affectedUrls: [page.finalUrl],
      impact: "Uncompressed HTML can increase transfer size and hurt perceived performance.",
      rootCause: "No Content-Encoding header was captured for a text/html response.",
      recommendation: "Enable gzip, Brotli or equivalent compression at the server or edge.",
      implementationPath: "Configure compression in the hosting platform, reverse proxy or framework server.",
      validation: ["curl -H 'Accept-Encoding: br,gzip' -I https://example.com/"],
      safeToAutoFix: false
    });
  }

  if (page.robotsMeta && /noindex/i.test(page.robotsMeta)) {
    add({
      id: "SEO-INDEX-001",
      title: "Important page is marked noindex",
      severity: "high",
      confidence: 98,
      evidence: [pageEvidence("meta[name=robots]", page.robotsMeta)],
      affectedUrls: [page.finalUrl],
      impact: "Search engines are instructed not to index a crawled canonical page.",
      rootCause: "The page includes a noindex robots meta directive.",
      recommendation: "Confirm the intended index/noindex policy before changing the directive.",
      implementationPath: "Remove noindex only after explicit owner approval.",
      validation: ["seo-polish validate --check seo"],
      approvalRequired: true
    });
  }

  if (!page.canonical) {
    add({
      id: "SEO-INDEX-003",
      title: "Canonical URL is missing",
      confidence: 92,
      evidence: [pageEvidence('link[rel="canonical"]', null)],
      affectedUrls: [page.finalUrl],
      impact: "Search engines have weaker canonicalization signals for this page.",
      rootCause: "No canonical link tag was found in the HTML head.",
      recommendation: "Add a self-referencing canonical tag for unambiguous public pages.",
      implementationPath: "Add canonical metadata in the framework SEO component or page template.",
      validation: ["seo-polish validate --check canonical"],
      safeToAutoFix: true
    });
  } else if (normalizeForCanonical(page.canonical) !== normalizeForCanonical(page.finalUrl)) {
    add({
      id: "SEO-INDEX-004",
      title: "Canonical URL is not self-referencing",
      confidence: 88,
      evidence: [pageEvidence('link[rel="canonical"]', page.canonical)],
      affectedUrls: [page.finalUrl],
      impact: "Search engines may index another URL instead of this crawled URL.",
      rootCause: "The canonical target differs from the final crawled URL.",
      recommendation: "Review whether this canonical target is intentional before changing it.",
      implementationPath: "Adjust canonical strategy only after confirming the preferred canonical URL.",
      validation: ["seo-polish validate --check canonical"],
      approvalRequired: true
    });
  }

  if (!page.title) {
    add({
      id: "SEO-ONPAGE-001",
      title: "Title tag is missing",
      confidence: 99,
      evidence: [pageEvidence("title", null)],
      affectedUrls: [page.finalUrl],
      impact: "Search results and browser tabs lack the primary page title signal.",
      rootCause: "The HTML document has no title element.",
      recommendation: "Add a concise unique title for the page.",
      implementationPath: "Update the page metadata template or route-specific metadata.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  } else if (page.title.length < 15) {
    add({
      id: "SEO-ONPAGE-003",
      title: "Title tag is very short",
      confidence: 85,
      evidence: [pageEvidence("title", page.title)],
      affectedUrls: [page.finalUrl],
      impact: "Short titles often under-describe the page in search results.",
      rootCause: "The title is below the recommended descriptive range.",
      recommendation: "Expand the title with a specific page topic and brand context.",
      implementationPath: "Update metadata templates or route content.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  } else if (page.title.length > 70) {
    add({
      id: "SEO-ONPAGE-004",
      title: "Title tag is likely too long",
      confidence: 85,
      evidence: [pageEvidence("title", page.title)],
      affectedUrls: [page.finalUrl],
      impact: "Long titles can be truncated in search results.",
      rootCause: "The title exceeds the expected display range.",
      recommendation: "Shorten the title while keeping the main query intent.",
      implementationPath: "Update metadata templates or route content.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  if (!page.metaDescription) {
    add({
      id: "SEO-ONPAGE-005",
      title: "Meta description is missing",
      confidence: 96,
      evidence: [pageEvidence('meta[name="description"]', null)],
      affectedUrls: [page.finalUrl],
      impact: "Search engines and link previews lack an owner-authored page summary.",
      rootCause: "No meta description was found.",
      recommendation: "Add a concise description that matches the page intent.",
      implementationPath: "Update metadata templates or route-specific metadata.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  const h1s = page.headings.filter((heading) => heading.level === 1);
  if (h1s.length === 0) {
    add({
      id: "SEO-ONPAGE-007",
      title: "H1 heading is missing",
      confidence: 96,
      evidence: [pageEvidence("h1", [])],
      affectedUrls: [page.finalUrl],
      impact: "The page lacks a clear primary heading for users, crawlers and agents.",
      rootCause: "No h1 element was extracted from the page.",
      recommendation: "Add one descriptive h1 that matches the page purpose.",
      implementationPath: "Update the page template or content block.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  } else if (h1s.length > 1) {
    add({
      id: "SEO-ONPAGE-008",
      title: "Multiple H1 headings were found",
      confidence: 90,
      evidence: [
        pageEvidence(
          "h1",
          h1s.map((heading) => heading.text)
        )
      ],
      affectedUrls: [page.finalUrl],
      impact: "Multiple primary headings can blur page hierarchy and intent.",
      rootCause: "The template or content contains more than one h1.",
      recommendation: "Keep one page-level h1 and demote supporting headings.",
      implementationPath: "Adjust heading levels in the page template.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  const headingJump = firstHeadingJump(page);
  if (headingJump) {
    add({
      id: "SEO-ONPAGE-009",
      title: "Heading hierarchy jumps levels",
      confidence: 80,
      evidence: [pageEvidence("headings", page.headings)],
      affectedUrls: [page.finalUrl],
      impact: "Skipped heading levels can make content harder to scan for users and assistive technology.",
      rootCause: `Heading level jumps from h${headingJump.from} to h${headingJump.to}.`,
      recommendation: "Use heading levels in document order without skipping structural levels.",
      implementationPath: "Adjust heading levels in content or templates.",
      validation: ["seo-polish validate --check accessibility"],
      safeToAutoFix: false
    });
  }

  if (!page.lang) {
    add({
      id: "SEO-ONPAGE-010",
      title: "HTML lang attribute is missing",
      confidence: 96,
      evidence: [pageEvidence("html[lang]", null)],
      affectedUrls: [page.finalUrl],
      impact: "Search engines and assistive technology lose a basic language signal.",
      rootCause: "The root html element does not declare a lang attribute.",
      recommendation: "Set the html lang attribute when the language is known.",
      implementationPath: "Update the root layout or document template.",
      validation: ["seo-polish validate --check accessibility"],
      safeToAutoFix: true
    });
  }

  if (
    (page.hreflangEntries?.length ?? 0) > 0 &&
    !page.hreflangEntries?.some((entry) => entry.language === "x-default")
  ) {
    add({
      id: "SEO-INTL-005",
      title: "Hreflang cluster has no x-default URL",
      confidence: 92,
      evidence: [pageEvidence('link[rel="alternate"][hreflang]', page.hreflangEntries)],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["international metadata"],
      impact: "Search systems lack a language-neutral fallback for users whose locale is not represented.",
      rootCause: "Alternate language links exist, but none declares hreflang x-default.",
      recommendation:
        "Add an x-default alternate only after confirming the correct language-neutral or selector URL.",
      implementationPath: "Update the international metadata generator with an owner-approved fallback URL.",
      validation: ["Verify every alternate cluster contains one x-default and reciprocal links."],
      approvalRequired: true
    });
  }

  if (!page.viewport) {
    add({
      id: "SEO-ONPAGE-011",
      title: "Viewport meta tag is missing",
      confidence: 96,
      evidence: [pageEvidence('meta[name="viewport"]', null)],
      affectedUrls: [page.finalUrl],
      impact: "Mobile rendering and mobile search presentation can be degraded.",
      rootCause: "No viewport meta tag was found.",
      recommendation: "Add a responsive viewport meta tag.",
      implementationPath:
        'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` in the document head.',
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: true
    });
  }

  if (Object.keys(page.openGraph).length === 0) {
    add({
      id: "SEO-ONPAGE-014",
      title: "Open Graph metadata is missing",
      confidence: 88,
      evidence: [pageEvidence("meta[property^=og:]", {})],
      affectedUrls: [page.finalUrl],
      impact: "Shared links lack owner-authored title, description and image metadata.",
      rootCause: "No Open Graph meta tags were extracted.",
      recommendation: "Add Open Graph defaults and route-specific overrides.",
      implementationPath: "Update the SEO component or metadata generator.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: true
    });
  }

  if (Object.keys(page.twitterCards).length === 0) {
    add({
      id: "SEO-ONPAGE-015",
      title: "Twitter/X Card metadata is missing",
      confidence: 88,
      evidence: [pageEvidence("meta[name^=twitter:]", {})],
      affectedUrls: [page.finalUrl],
      impact: "Shared links on social surfaces may render without controlled card metadata.",
      rootCause: "No Twitter/X Card meta tags were extracted.",
      recommendation: "Add Twitter/X Card defaults where social previews matter.",
      implementationPath: "Update the SEO component or metadata generator.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: true
    });
  }

  if (page.wordCount > 0 && page.wordCount < 150) {
    add({
      id: "SEO-CONTENT-001",
      title: "Page has thin visible content",
      confidence: 82,
      evidence: [pageEvidence("body", { wordCount: page.wordCount, excerpt: page.bodyExcerpt })],
      affectedUrls: [page.finalUrl],
      impact: "Thin pages often fail to satisfy search intent or give agents enough context.",
      rootCause: "The extracted main text is below the conservative thin-content threshold.",
      recommendation:
        "Expand the page with useful, specific content that addresses the intended query or task.",
      implementationPath: "Review content strategy and add relevant copy, examples, FAQs or next steps.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  for (const jsonLd of page.jsonLd.filter((item) => item.parseError !== null)) {
    add({
      id: "SEO-SCHEMA-001",
      title: "JSON-LD is invalid",
      confidence: 99,
      evidence: [pageEvidence('script[type="application/ld+json"]', jsonLd.parseError)],
      affectedUrls: [page.finalUrl],
      impact: "Invalid structured data cannot be interpreted reliably by search systems.",
      rootCause: "The JSON-LD script failed JSON parsing.",
      recommendation: "Fix JSON syntax and validate structured data.",
      implementationPath: "Repair the JSON-LD generator or static script block.",
      validation: ["seo-polish validate --check structured-data"],
      safeToAutoFix: true
    });
  }

  const schemaTypes = new Set(page.jsonLd.flatMap((item) => item.types));
  if (page.jsonLd.length === 0 || !schemaTypes.has("Organization")) {
    add({
      id: "SEO-SCHEMA-003",
      title: "Organization structured data is missing",
      confidence: 75,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      impact: "Search systems lack a machine-readable organization identity signal.",
      rootCause: "No Organization JSON-LD type was found.",
      recommendation: "Add Organization JSON-LD when the organization identity is known.",
      implementationPath: "Generate Organization JSON-LD from approved site identity fields.",
      validation: ["seo-polish validate --check structured-data"],
      approvalRequired: true
    });
  }

  if (page.jsonLd.length === 0 || !schemaTypes.has("WebSite")) {
    add({
      id: "SEO-SCHEMA-004",
      title: "WebSite structured data is missing",
      confidence: 75,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      impact: "Search systems lack a machine-readable site identity signal.",
      rootCause: "No WebSite JSON-LD type was found.",
      recommendation: "Add WebSite JSON-LD with canonical site name and URL.",
      implementationPath: "Generate WebSite JSON-LD from approved site identity fields.",
      validation: ["seo-polish validate --check structured-data"],
      approvalRequired: true
    });
  }

  if (page.internalLinks.length > 2 && !schemaTypes.has("BreadcrumbList")) {
    add({
      id: "SEO-SCHEMA-006",
      title: "Breadcrumb structured data is missing",
      confidence: 72,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      impact: "Search systems do not receive a machine-readable breadcrumb trail.",
      rootCause: "The page appears navigable but lacks BreadcrumbList JSON-LD.",
      recommendation: "Add BreadcrumbList JSON-LD from visible breadcrumb/navigation data.",
      implementationPath: "Generate BreadcrumbList from existing route hierarchy when unambiguous.",
      validation: ["seo-polish validate --check structured-data"],
      safeToAutoFix: true
    });
  }

  if (page.wordCount < 30 && page.internalLinks.length === 0) {
    add({
      id: "SEO-JS-001",
      title: "Important content may depend on client-side rendering",
      confidence: 70,
      evidence: [
        pageEvidence("body", { wordCount: page.wordCount, internalLinks: page.internalLinks.length })
      ],
      affectedUrls: [page.finalUrl],
      impact: "Crawlers and agents may see little useful content in raw HTML.",
      rootCause: "The raw HTML contains very little text and no crawlable internal links.",
      recommendation: "Ensure primary content, metadata and links are present in server-rendered HTML.",
      implementationPath: "Review rendering strategy and add server-rendered or prerendered content.",
      validation: ["seo-polish validate --check javascript-seo"],
      safeToAutoFix: false
    });
  }

  if (page.internalLinks.length === 0 && page.wordCount >= 30) {
    add({
      id: "SEO-LINK-003",
      title: "Page has weak internal linking",
      confidence: 76,
      evidence: [pageEvidence("a[href]", { internalLinks: page.internalLinks.length })],
      affectedUrls: [page.finalUrl],
      impact: "Users, crawlers and agents have fewer paths to related canonical content.",
      rootCause: "No crawlable internal links were extracted from the page.",
      recommendation: "Add contextual internal links to related pages, hubs or next-step content.",
      implementationPath: "Update page content or navigation to include relevant internal links.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  const imagesMissingAlt = page.images.filter((image) => image.alt === null || image.alt.trim() === "");
  if (imagesMissingAlt.length > 0) {
    add({
      id: "SEO-MEDIA-001",
      title: "Images are missing alt text",
      confidence: 96,
      evidence: [pageEvidence("img[alt]", imagesMissingAlt.slice(0, 10))],
      affectedUrls: [page.finalUrl],
      impact: "Informative images may be inaccessible and less useful for image search.",
      rootCause: "One or more img elements have empty or missing alt attributes.",
      recommendation:
        "Add meaningful alt text for informative images and empty alt only for decorative images.",
      implementationPath: "Update image components or content records.",
      validation: ["seo-polish validate --check accessibility"],
      safeToAutoFix: false
    });
  }

  const imagesMissingDimensions = page.images.filter((image) => !image.hasWidth || !image.hasHeight);
  if (imagesMissingDimensions.length > 0) {
    add({
      id: "SEO-MEDIA-005",
      title: "Images are missing width or height attributes",
      confidence: 90,
      evidence: [pageEvidence("img[width][height]", imagesMissingDimensions.slice(0, 10))],
      affectedUrls: [page.finalUrl],
      impact: "Layout shifts can harm user experience and performance metrics.",
      rootCause: "One or more images lack intrinsic dimensions in markup.",
      recommendation: "Provide width and height or equivalent layout constraints for images.",
      implementationPath: "Update image components or generated HTML.",
      validation: ["seo-polish validate --check performance"],
      safeToAutoFix: false
    });
  }

  if (!page.hasSkipLink && page.headings.length > 2) {
    add({
      id: "SEO-A11Y-010",
      title: "Skip link is missing",
      confidence: 70,
      evidence: [pageEvidence('a[href="#main"]', null)],
      affectedUrls: [page.finalUrl],
      impact: "Keyboard and assistive technology users have less efficient navigation.",
      rootCause: "No skip link to main content was found.",
      recommendation: "Add a skip-to-content link before primary navigation.",
      implementationPath: "Update the root layout or document shell.",
      validation: ["seo-polish validate --check accessibility"],
      safeToAutoFix: true
    });
  }

  if (scan.siteType === "local-business" && !schemaTypes.has("LocalBusiness")) {
    add({
      id: "SEO-LOCAL-003",
      title: "LocalBusiness structured data is missing",
      confidence: 82,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["local business page"],
      impact: "Local search systems lack structured location, contact and opening-hours signals.",
      rootCause: "The site appears local-business oriented, but no LocalBusiness JSON-LD was found.",
      recommendation: "Add LocalBusiness JSON-LD from owner-approved business details.",
      implementationPath: "Generate LocalBusiness schema only after confirming NAP and opening-hours data.",
      validation: ["Validate LocalBusiness schema with approved business details."],
      approvalRequired: true
    });
  }

  if (scan.siteType === "local-business" && lacksNapSignals(page.bodyExcerpt)) {
    add({
      id: "SEO-LOCAL-001",
      title: "Local business NAP signals are incomplete",
      confidence: 70,
      evidence: [pageEvidence("body.nap-signals", page.bodyExcerpt.slice(0, 400))],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["local business page"],
      impact: "Local users and search systems may not find a consistent name, address and phone signal.",
      rootCause: "The visible page excerpt lacks clear address or phone patterns.",
      recommendation: "Add owner-approved name, address and phone information where appropriate.",
      implementationPath: "Update contact/location content after confirming business details.",
      validation: ["Manually verify published NAP details against the owner-approved source."],
      approvalRequired: true
    });
  }

  if (
    scan.siteType === "local-business" &&
    !page.jsonLd.some((item) => hasJsonKey(item.parsed, ["openingHours", "openingHoursSpecification"])) &&
    !/\b(?:open|hours|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(page.bodyExcerpt)
  ) {
    add({
      id: "SEO-LOCAL-004",
      title: "Opening-hours information is missing",
      confidence: 76,
      evidence: [
        pageEvidence("local.opening-hours", {
          bodyExcerpt: page.bodyExcerpt.slice(0, 300),
          jsonLdTypes: [...schemaTypes]
        })
      ],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["local business page"],
      impact: "Local users and search systems cannot determine when the business is available.",
      rootCause: "No visible or structured opening-hours signal was detected on the local-business page.",
      recommendation: "Publish owner-approved opening hours visibly and in LocalBusiness structured data.",
      implementationPath: "Add verified business hours from the canonical business record.",
      validation: ["Confirm displayed and structured hours match the owner-approved business source."],
      approvalRequired: true
    });
  }

  if (scan.siteType === "commerce" && !schemaTypes.has("Product")) {
    add({
      id: "SEO-ECOM-001",
      title: "Product structured data is missing",
      confidence: 84,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["product or commerce page"],
      impact: "Product search surfaces cannot read product identity, image, price or availability metadata.",
      rootCause: "The site appears commerce oriented, but no Product JSON-LD was found.",
      recommendation: "Add Product JSON-LD on product detail templates.",
      implementationPath:
        "Generate Product schema from existing product records and approved merchant fields.",
      validation: ["Validate Product schema and visible product data consistency."],
      safeToAutoFix: false
    });
  }

  if (scan.siteType === "commerce" && !schemaTypes.has("Offer")) {
    add({
      id: "SEO-ECOM-002",
      title: "Offer structured data is missing",
      confidence: 80,
      evidence: [pageEvidence("jsonld.types", [...schemaTypes])],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["product or commerce page"],
      impact: "Commerce search surfaces cannot read price, currency and availability metadata.",
      rootCause: "The site appears commerce oriented, but no Offer JSON-LD was found.",
      recommendation: "Add Offer JSON-LD using owner-approved price, currency and availability data.",
      implementationPath: "Generate Offer schema from product records after confirming commercial data.",
      validation: ["Manually verify price and availability values before publishing."],
      approvalRequired: true
    });
  }

  if (
    scan.siteType === "commerce" &&
    !schemaTypes.has("MerchantReturnPolicy") &&
    !page.jsonLd.some((item) =>
      hasJsonKey(item.parsed, ["hasMerchantReturnPolicy", "merchantReturnPolicy"])
    ) &&
    !/\breturn(?:s| policy)?\b/i.test(page.bodyExcerpt)
  ) {
    add({
      id: "SEO-ECOM-013",
      title: "Merchant return policy is not discoverable",
      confidence: 74,
      evidence: [
        pageEvidence("commerce.return-policy", {
          bodyExcerpt: page.bodyExcerpt.slice(0, 300),
          jsonLdTypes: [...schemaTypes]
        })
      ],
      affectedUrls: [page.finalUrl],
      affectedTemplates: ["product or commerce page"],
      impact: "Shoppers and commerce search surfaces lack a clear return-policy signal.",
      rootCause: "No visible return-policy reference or MerchantReturnPolicy structured data was detected.",
      recommendation:
        "Link an owner-approved return policy and add matching structured data where applicable.",
      implementationPath: "Publish policy content only after legal and commerce owner approval.",
      validation: ["Verify visible policy terms exactly match structured data and approved policy text."],
      approvalRequired: true
    });
  }
}

function evaluateCrossPageRules(scan: ScanResult, add: (input: FindingInput) => void): void {
  const sitemapSet = new Set(scan.discovery.sitemapUrls.map(normalizeForCanonical));
  const sitemapEvidence = scan.discovery.sitemapXml
    ? toEvidence(scan.discovery.sitemapXml, "sitemap-cross-page")
    : fallbackEvidence("/sitemap.xml", scan);

  const internationalSite = scan.pages.some(
    (page) => (page.hreflangEntries?.length ?? page.hreflang.length) > 0
  );
  if (internationalSite) {
    const missingHreflang = scan.pages
      .filter((page) => (page.hreflangEntries?.length ?? page.hreflang.length) === 0)
      .map((page) => page.finalUrl);
    if (missingHreflang.length > 0) {
      add({
        id: "SEO-INTL-001",
        title: "Pages in an international site are missing hreflang",
        confidence: 88,
        evidence: [crossPageEvidence("hreflang-coverage", missingHreflang)],
        affectedUrls: missingHreflang,
        affectedTemplates: ["international metadata"],
        impact: "Search systems may serve the wrong language or regional URL for affected pages.",
        rootCause: "Other crawled pages publish alternate-language clusters, but these pages publish none.",
        recommendation: "Add reciprocal hreflang clusters only for confirmed equivalent localized URLs.",
        implementationPath:
          "Update the international route metadata generator after validating locale mappings.",
        validation: ["Verify reciprocal locale URLs, canonical consistency and one x-default fallback."],
        approvalRequired: true
      });
    }
  }

  if (sitemapSet.size > 0) {
    const missingFromSitemap = scan.pages
      .filter((page) => page.status >= 200 && page.status < 300)
      .filter((page) => !sitemapSet.has(normalizeForCanonical(page.finalUrl)))
      .map((page) => page.finalUrl);
    if (missingFromSitemap.length > 0) {
      add({
        id: "SEO-SITEMAP-011",
        title: "Crawled public pages are missing from sitemap.xml",
        confidence: 84,
        evidence: [sitemapEvidence],
        affectedUrls: missingFromSitemap,
        impact: "Search crawlers and agents may miss canonical public pages not listed in the sitemap.",
        rootCause: "The crawler found public pages through links that are absent from sitemap loc entries.",
        recommendation:
          "Include canonical public pages in the sitemap or intentionally remove crawlable links.",
        implementationPath: "Update the sitemap generator to include linked canonical pages.",
        validation: ["seo-polish validate --check sitemap"],
        safeToAutoFix: false
      });
    }
  }

  const duplicateTitles = duplicateGroups(
    scan.pages.filter((page) => Boolean(page.title)),
    (page) => (page.title ?? "").trim().toLowerCase()
  );
  for (const group of duplicateTitles) {
    add({
      id: "SEO-ONPAGE-002",
      title: "Duplicate title tags found",
      confidence: 88,
      evidence: [
        crossPageEvidence(
          "title",
          group.map((page) => page.title)
        )
      ],
      affectedUrls: group.map((page) => page.finalUrl),
      impact: "Duplicate titles make pages harder to distinguish in search results and agent summaries.",
      rootCause: "Multiple crawled pages share the same title string.",
      recommendation: "Make page titles unique while preserving template consistency.",
      implementationPath: "Update metadata templates or route-specific title fields.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  const duplicateDescriptions = duplicateGroups(
    scan.pages.filter((page) => Boolean(page.metaDescription)),
    (page) => (page.metaDescription ?? "").trim().toLowerCase()
  );
  for (const group of duplicateDescriptions) {
    add({
      id: "SEO-ONPAGE-006",
      title: "Duplicate meta descriptions found",
      confidence: 84,
      evidence: [
        crossPageEvidence(
          "meta[name=description]",
          group.map((page) => page.metaDescription)
        )
      ],
      affectedUrls: group.map((page) => page.finalUrl),
      impact: "Duplicate descriptions weaken page-specific search snippets and agent previews.",
      rootCause: "Multiple pages share the same meta description.",
      recommendation: "Write page-specific descriptions that match each page intent.",
      implementationPath: "Update metadata templates or route-specific description fields.",
      validation: ["seo-polish validate --check seo"],
      safeToAutoFix: false
    });
  }

  const duplicateContent = duplicateGroups(
    scan.pages.filter((page) => page.wordCount >= 80),
    (page) => page.bodyExcerpt.slice(0, 600).trim().toLowerCase()
  );
  for (const group of duplicateContent) {
    add({
      id: "SEO-CONTENT-002",
      title: "Duplicate visible content found across pages",
      confidence: 78,
      evidence: [
        crossPageEvidence(
          "body-excerpt",
          group.map((page) => page.bodyExcerpt.slice(0, 160))
        )
      ],
      affectedUrls: group.map((page) => page.finalUrl),
      impact: "Duplicate pages can split ranking signals and confuse agents about the canonical source.",
      rootCause: "Multiple crawled pages expose the same leading body content.",
      recommendation: "Consolidate duplicate pages, differentiate content, or canonicalize intentionally.",
      implementationPath: "Review duplicate templates and canonical strategy before changing URLs.",
      validation: ["seo-polish validate --check seo"],
      approvalRequired: true
    });
  }

  const hubCandidates = scan.pages.filter((page) => page.internalLinks.length >= 4);
  if (scan.pages.length >= 4 && hubCandidates.length === 0) {
    add({
      id: "SEO-LINK-009",
      title: "No clear internal hub page was detected",
      confidence: 68,
      evidence: [
        crossPageEvidence(
          "crawl-graph",
          scan.pages.map((page) => [page.finalUrl, page.internalLinks.length])
        )
      ],
      affectedTemplates: ["internal linking"],
      impact:
        "A site without hub pages can be harder for crawlers, users and agents to navigate efficiently.",
      rootCause: "No crawled page links to four or more internal pages.",
      recommendation: "Create or strengthen hub/navigation pages for important topic or product clusters.",
      implementationPath: "Review information architecture and add contextual hub links.",
      validation: ["Review crawl-graph.json and internal-link-opportunities.json."],
      safeToAutoFix: false
    });
  }
}

function evaluatePerformanceRules(scan: ScanResult, add: (input: FindingInput) => void): void {
  const performance = scan.performance;
  if (!performance) {
    return;
  }

  const metricEvidence = (metricId: string): Evidence => {
    const metric = performance.metrics.find((item) => item.id === metricId);
    const evidence: Evidence = {
      id: `performance-${metricId}`,
      type: "performance_metric",
      value: metric ?? null,
      timestamp: new Date().toISOString()
    };
    scan.evidence.push(evidence);
    return evidence;
  };

  const failed = new Set(
    performance.metrics.filter((metric) => metric.status === "failed").map((metric) => metric.id)
  );
  const affectedUrls = scan.pages.slice(0, 5).map((page) => page.finalUrl);

  if (failed.has("lcp-ms")) {
    add({
      id: "SEO-PERF-001",
      title: "Largest Contentful Paint exceeds the configured budget",
      severity: "medium",
      confidence: 90,
      evidence: [metricEvidence("lcp-ms")],
      affectedUrls,
      affectedTemplates: ["performance profile"],
      impact: "Slow largest-content rendering degrades real user experience and Core Web Vitals performance.",
      rootCause: "Measured browser or field LCP exceeds the configured good threshold.",
      recommendation:
        "Optimize the LCP resource, server response, critical rendering path and above-the-fold layout.",
      implementationPath:
        "Use browser and field evidence to identify the LCP element before changing source or infrastructure.",
      validation: [
        "Re-run browser evidence and confirm p75 field or repeated lab LCP meets the configured budget."
      ],
      safeToAutoFix: false
    });
  }

  if (failed.has("document-fetch-ms")) {
    add({
      id: "SEO-PERF-024",
      title: "Document fetch duration exceeds the configured budget",
      severity: "medium",
      confidence: 78,
      evidence: [metricEvidence("document-fetch-ms")],
      affectedUrls,
      affectedTemplates: ["performance profile"],
      impact: "Slow document responses can delay discovery, rendering and agent retrieval.",
      rootCause: "Repeated HTTP fetch measurements exceeded the configured document fetch budget.",
      recommendation:
        "Review hosting, edge caching, server rendering cost and redirect behavior for public pages.",
      implementationPath:
        "Optimize framework rendering, cache policy or hosting configuration for slow documents.",
      validation: ["Re-run seo-polish scan and compare performance-audit.json."],
      safeToAutoFix: false
    });
  }

  if (failed.has("total-js-kb")) {
    add({
      id: "SEO-PERF-020",
      title: "JavaScript transfer exceeds the configured budget",
      severity: "medium",
      confidence: 74,
      evidence: [metricEvidence("total-js-kb")],
      affectedUrls,
      affectedTemplates: ["frontend bundle"],
      impact: "Large JavaScript payloads can delay rendering, interaction and crawler processing.",
      rootCause: "Discovered script resources with measurable Content-Length exceed the configured budget.",
      recommendation: "Split, defer, remove or server-render non-critical JavaScript.",
      implementationPath: "Review bundle composition and route-level imports in the website source repo.",
      validation: ["Re-run seo-polish scan and inspect resource-timing.json."],
      safeToAutoFix: false
    });
  }

  if (failed.has("third-party-js-kb")) {
    add({
      id: "SEO-PERF-021",
      title: "Third-party JavaScript transfer exceeds the configured budget",
      severity: "medium",
      confidence: 72,
      evidence: [metricEvidence("third-party-js-kb")],
      affectedUrls,
      affectedTemplates: ["third-party scripts"],
      impact: "Third-party scripts can increase blocking cost, privacy surface and performance variance.",
      rootCause: "Measured third-party script resources exceed the configured transfer budget.",
      recommendation: "Remove, defer or conditionally load third-party scripts that are not essential.",
      implementationPath:
        "Review analytics, embeds and marketing scripts with product owner approval where needed.",
      validation: ["Re-run seo-polish scan and compare third-party-cost evidence in performance-audit.json."],
      safeToAutoFix: false
    });
  }

  if (failed.has("render-blocking-requests")) {
    add({
      id: "SEO-PERF-022",
      title: "Render-blocking request pressure exceeds the configured budget",
      severity: "low",
      confidence: 70,
      evidence: [metricEvidence("render-blocking-requests")],
      affectedUrls,
      affectedTemplates: ["document head"],
      impact: "Blocking stylesheets and synchronous scripts can delay first render.",
      rootCause: "Static HTML discovery found too many render-blocking script or stylesheet resources.",
      recommendation:
        "Inline critical CSS carefully, defer non-critical scripts and reduce blocking head resources.",
      implementationPath: "Update document head, bundler settings or framework script strategy.",
      validation: ["Re-run seo-polish scan and inspect performance-audit.json."],
      safeToAutoFix: false
    });
  }

  if (failed.has("total-requests")) {
    add({
      id: "SEO-PERF-023",
      title: "Request count exceeds the configured budget",
      severity: "low",
      confidence: 68,
      evidence: [metricEvidence("total-requests")],
      affectedUrls,
      affectedTemplates: ["page resources"],
      impact: "High request pressure can amplify latency and make page load performance less reliable.",
      rootCause: "The crawler discovered more document and resource requests than the configured budget.",
      recommendation: "Consolidate assets, remove unused resources and lazy-load non-critical media.",
      implementationPath: "Review resource-timing.json and optimize the highest-cost templates first.",
      validation: ["Re-run seo-polish scan and compare request totals."],
      safeToAutoFix: false
    });
  }
}

function evaluateMcpSafety(scan: ScanResult, add: (input: FindingInput) => void): void {
  const probe = scan.discovery.endpoints["/.well-known/mcp.json"];
  if (!probe?.ok || !probe.bodyExcerpt.trim().startsWith("{")) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(probe.bodyExcerpt);
  } catch {
    return;
  }

  const riskyTools = collectRiskyToolNames(parsed);
  if (riskyTools.length === 0) {
    return;
  }

  add({
    id: "AR-MCP-005",
    title: "MCP metadata appears to expose mutating tools",
    severity: "critical",
    confidence: 82,
    evidence: [toEvidence(probe, "mcp-mutating-tools")],
    affectedUrls: [probe.url],
    affectedTemplates: riskyTools,
    impact:
      "Agents could discover write, delete, checkout or payment-like capabilities without an approval boundary.",
    rootCause: "MCP metadata contains tool names or descriptions that look mutating.",
    recommendation: "Require auth, rate limits and explicit user approval for any mutating MCP tool.",
    implementationPath:
      "Mark mutating tools approval-required or remove them from public discovery until reviewed.",
    validation: ["Review MCP server card and tool schemas manually before publication."],
    approvalRequired: true
  });
}

function discoveryJsonRule(
  scan: ScanResult,
  add: (input: FindingInput) => void,
  path: string,
  missingId: string,
  invalidId: string,
  label: string
): void {
  const probe = scan.discovery.endpoints[path];
  if (!probe?.ok) {
    add({
      id: missingId,
      title: `${label} is missing`,
      confidence: 88,
      evidence: [probe ? toEvidence(probe, `missing-${path}`) : fallbackEvidence(path, scan)],
      affectedUrls: [new URL(path, scan.config.url).toString()],
      impact: `Agents cannot discover ${label.toLowerCase()} metadata from the canonical origin.`,
      rootCause: `${path} did not return a successful response.`,
      recommendation: `Publish ${label} metadata when the site has a stable public contract for it.`,
      implementationPath: `Generate ${path} from approved public metadata.`,
      validation: ["seo-polish validate --check agent-readiness"],
      safeToAutoFix: label !== "MCP discovery"
    });
    return;
  }

  try {
    JSON.parse(probe.bodyExcerpt);
  } catch (error) {
    add({
      id: invalidId,
      title: `${label} JSON is invalid`,
      confidence: 96,
      evidence: [toEvidence(probe, `invalid-${path}`)],
      affectedUrls: [probe.url],
      impact: `Agents cannot parse ${label.toLowerCase()} metadata reliably.`,
      rootCause: error instanceof Error ? error.message : String(error),
      recommendation: `Fix ${label} JSON syntax and validate against the published contract.`,
      implementationPath: `Repair the static JSON or route handler for ${path}.`,
      validation: ["seo-polish validate --check agent-readiness"],
      safeToAutoFix: true
    });
  }
}

function toEvidence(
  probe: {
    url: string;
    path: string;
    status: number | null;
    ok: boolean;
    contentType: string | null;
    bodyExcerpt: string;
  },
  idPrefix: string
): Evidence {
  const evidence: Evidence = {
    id: idPrefix.replace(/[^a-z0-9-]+/gi, "-"),
    type: "http_status",
    url: probe.url,
    value: { path: probe.path, ok: probe.ok, contentType: probe.contentType },
    excerpt: probe.bodyExcerpt.slice(0, 500),
    timestamp: new Date().toISOString()
  };
  if (probe.status !== null) {
    evidence.status = probe.status;
  }
  return evidence;
}

function fallbackEvidence(path: string, scan: ScanResult): Evidence {
  return {
    id: `missing-${path.replace(/[^a-z0-9]+/gi, "-")}`,
    type: "http_status",
    url: new URL(path, scan.config.url).toString(),
    status: 0,
    value: { path, ok: false },
    timestamp: new Date().toISOString()
  };
}

function firstHeadingJump(page: PageSnapshot): { from: number; to: number } | null {
  let previous = 0;
  for (const heading of page.headings) {
    if (previous > 0 && heading.level > previous + 1) {
      return { from: previous, to: heading.level };
    }
    previous = heading.level;
  }
  return null;
}

function duplicateGroups<T>(items: T[], keyFor: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function crossPageEvidence(selector: string, value: unknown): Evidence {
  return {
    id: `cross-page-${selector.replace(/[^a-z0-9]+/gi, "-")}`,
    type: selector === "crawl-graph" ? "crawl_graph" : "html_selector",
    selector,
    value,
    timestamp: new Date().toISOString()
  };
}

function hasCacheHeader(headers: Record<string, string>): boolean {
  return Boolean(headers["cache-control"] || headers.expires);
}

function hasCompressionHeader(headers: Record<string, string>): boolean {
  return Boolean(headers["content-encoding"]);
}

function likelyCompressible(page: PageSnapshot): boolean {
  return page.contentType.includes("text/html") && page.bodyExcerpt.length > 500;
}

function lacksNapSignals(text: string): boolean {
  const lower = text.toLowerCase();
  const hasAddressWord =
    lower.includes("street") ||
    lower.includes("st.") ||
    lower.includes("road") ||
    lower.includes("avenue") ||
    lower.includes("suite") ||
    lower.includes("address");
  const digits = [...text].filter((char) => char >= "0" && char <= "9").length;
  const hasPhoneLikeNumber = digits >= 7;
  return !hasAddressWord || !hasPhoneLikeNumber;
}

function hasJsonKey(value: unknown, keys: string[]): boolean {
  const expected = new Set(keys);
  let found = false;
  const visit = (item: unknown): void => {
    if (found) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => expected.has(key))) {
      found = true;
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return found;
}

function collectRiskyToolNames(value: unknown): string[] {
  const risky = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    const name = stringField(record, "name") ?? stringField(record, "id") ?? stringField(record, "title");
    const description = stringField(record, "description") ?? stringField(record, "summary") ?? "";
    const combined = `${name ?? ""} ${description}`.toLowerCase();
    if (name && isMutatingToolText(combined)) {
      risky.add(name);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...risky];
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function isMutatingToolText(text: string): boolean {
  const terms = [
    "create",
    "update",
    "delete",
    "remove",
    "write",
    "mutate",
    "checkout",
    "payment",
    "purchase",
    "refund",
    "cancel",
    "send"
  ];
  return terms.some((term) => text.includes(term));
}

function analyzeRobotsBody(body: string): { hasAiPolicySignal: boolean; hasPrivateDisallows: boolean } {
  let hasAiPolicySignal = false;
  let hasPrivateDisallows = false;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().toLowerCase();
    if (
      line.includes("content-signal") ||
      line.includes("ai-input") ||
      line.includes("ai-train") ||
      line.includes("gptbot") ||
      line.includes("google-extended") ||
      line.includes("ccbot")
    ) {
      hasAiPolicySignal = true;
    }
    if (
      line.startsWith("disallow:") &&
      (line.includes("/admin") ||
        line.includes("/account") ||
        line.includes("/login") ||
        line.includes("/logout") ||
        line.includes("/checkout") ||
        line.includes("/cart") ||
        line.includes("/payment") ||
        line.includes("/private") ||
        line.includes("/preview") ||
        line.includes("/api/internal"))
    ) {
      hasPrivateDisallows = true;
    }
  }
  return { hasAiPolicySignal, hasPrivateDisallows };
}

function normalizeForCanonical(input: string): string {
  const url = new URL(input);
  url.hash = "";
  if (url.pathname.endsWith("/") && url.pathname !== "/") {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

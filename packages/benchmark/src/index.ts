import type { Finding, ScanResult } from "@seo-polish/schemas";

export interface AgentBenchmarkMetric {
  name: string;
  value: number;
  unit: string;
}

export interface AgentBenchmarkResult {
  status: "completed";
  metrics: AgentBenchmarkMetric[];
  score: number;
  summary: string;
}

export function benchmarkAgentExperience(scan: ScanResult, findings: Finding[]): AgentBenchmarkResult {
  const discovery = scan.discovery;
  const hasLlms = discovery.llmsTxt?.ok === true;
  const hasMarkdown = discovery.markdownNegotiation?.contentType
    ? /markdown|text\/plain/i.test(discovery.markdownNegotiation.contentType)
    : false;
  const hasMcp = discovery.endpoints["/.well-known/mcp.json"]?.ok === true;
  const hasApiCatalog = discovery.endpoints["/.well-known/api-catalog"]?.ok === true;
  const hasSkills = discovery.endpoints["/.well-known/agent-skills/index.json"]?.ok === true;
  const canonicalSourceCount = scan.discovery.sitemapUrls.length + scan.pages.length;
  const agentFindings = findings.filter((finding) =>
    ["agent_readiness", "protocol_discovery", "api_auth_mcp", "policy"].includes(finding.category)
  );
  const criticalAgentFindings = agentFindings.filter((finding) => finding.severity === "critical").length;

  const metrics: AgentBenchmarkMetric[] = [
    metric("canonical_sources", canonicalSourceCount, "count"),
    metric(
      "estimated_agent_requests_to_source",
      estimateRequestsToSource(hasLlms, hasMarkdown, hasApiCatalog),
      "requests"
    ),
    metric("estimated_context_waste", estimateContextWaste(scan), "tokens"),
    metric("llms_txt_available", hasLlms ? 1 : 0, "boolean"),
    metric("markdown_available", hasMarkdown ? 1 : 0, "boolean"),
    metric("mcp_discovery_available", hasMcp ? 1 : 0, "boolean"),
    metric("api_catalog_available", hasApiCatalog ? 1 : 0, "boolean"),
    metric("agent_skills_available", hasSkills ? 1 : 0, "boolean"),
    metric("agent_readiness_findings", agentFindings.length, "count"),
    metric("critical_agent_readiness_findings", criticalAgentFindings, "count")
  ];

  const score = clamp(
    100 -
      agentFindings.reduce((sum, finding) => sum + severityPenalty(finding.severity), 0) +
      (hasLlms ? 8 : 0) +
      (hasMarkdown ? 6 : 0) +
      (hasMcp ? 4 : 0) +
      (hasApiCatalog ? 4 : 0) +
      (hasSkills ? 4 : 0)
  );

  return {
    status: "completed",
    metrics,
    score,
    summary:
      score >= 80
        ? "Agents have a clear path to canonical source material."
        : "Agents need better public discovery, compact source formats or protocol metadata."
  };
}

export function renderBenchmarkMarkdown(result: AgentBenchmarkResult): string {
  const lines = [
    "# Agent Experience Benchmark",
    "",
    `Score: ${result.score}/100`,
    "",
    result.summary,
    "",
    "| Metric | Value | Unit |",
    "|---|---:|---|"
  ];
  for (const item of result.metrics) {
    lines.push(`| ${item.name} | ${item.value} | ${item.unit} |`);
  }
  return `${lines.join("\n")}\n`;
}

function estimateRequestsToSource(hasLlms: boolean, hasMarkdown: boolean, hasApiCatalog: boolean): number {
  if (hasLlms && hasMarkdown) return 2;
  if (hasLlms || hasApiCatalog) return 3;
  return 5;
}

function estimateContextWaste(scan: ScanResult): number {
  const averageWords =
    scan.pages.length === 0
      ? 0
      : scan.pages.reduce((sum, page) => sum + page.wordCount, 0) / Math.max(1, scan.pages.length);
  return Math.round(Math.max(0, averageWords - 200) * 1.4);
}

function severityPenalty(severity: Finding["severity"]): number {
  switch (severity) {
    case "critical":
      return 30;
    case "high":
      return 14;
    case "medium":
      return 7;
    case "low":
      return 3;
    case "info":
      return 1;
  }
}

function metric(name: string, value: number, unit: string): AgentBenchmarkMetric {
  return { name, value, unit };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

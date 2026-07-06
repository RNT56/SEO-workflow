export const SEO_POLISH_TOOLS = [
  "scan_site",
  "get_findings",
  "get_report",
  "create_remediation_plan",
  "apply_patch",
  "validate_site",
  "validate_report",
  "explain_finding",
  "generate_llms_txt",
  "generate_robots_txt",
  "generate_agent_skills",
  "generate_api_catalog",
  "generate_mcp_card",
  "generate_a2a_card",
  "benchmark_agent_experience"
] as const;

export type SeoPolishToolName = (typeof SEO_POLISH_TOOLS)[number];

export interface ToolCall {
  name: SeoPolishToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  content: unknown;
}

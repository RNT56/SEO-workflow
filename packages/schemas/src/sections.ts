import type { FindingCategory } from "./types.js";

export interface ReportSection {
  number: number;
  title: string;
  categories: FindingCategory[];
}

export const REPORT_SECTIONS: ReportSection[] = [
  { number: 1, title: "Executive Summary", categories: [] },
  { number: 2, title: "Score Overview", categories: [] },
  { number: 3, title: "Priority Action Plan", categories: [] },
  { number: 4, title: "Critical SEO Issues", categories: ["technical_seo", "crawlability", "indexability"] },
  {
    number: 5,
    title: "Critical Agent Readiness Issues",
    categories: ["agent_readiness", "protocol_discovery", "api_auth_mcp"]
  },
  { number: 6, title: "Technical SEO", categories: ["technical_seo"] },
  { number: 7, title: "Crawlability & Indexability", categories: ["crawlability", "indexability"] },
  { number: 8, title: "On-Page SEO", categories: ["onpage_seo"] },
  { number: 9, title: "Content Quality & Search Intent", categories: ["content_seo"] },
  { number: 10, title: "Internal Linking & Information Architecture", categories: ["internal_linking"] },
  { number: 11, title: "Structured Data", categories: ["structured_data"] },
  { number: 12, title: "Performance & Core Web Vitals", categories: ["performance_seo"] },
  { number: 13, title: "JavaScript SEO", categories: ["javascript_seo"] },
  { number: 14, title: "Image & Media SEO", categories: ["media_seo", "accessibility"] },
  { number: 15, title: "International SEO", categories: ["international_seo"] },
  { number: 16, title: "Local SEO", categories: ["local_seo"] },
  { number: 17, title: "E-Commerce SEO", categories: ["ecommerce_seo"] },
  {
    number: 18,
    title: "robots.txt, sitemap.xml and llms.txt",
    categories: ["crawlability", "agent_readiness"]
  },
  { number: 19, title: "Agent Readiness", categories: ["agent_readiness"] },
  {
    number: 20,
    title: "MCP, Agent Skills and API Discovery",
    categories: ["protocol_discovery", "api_auth_mcp"]
  },
  { number: 21, title: "Security, Privacy and Policy Risks", categories: ["security", "policy"] },
  { number: 22, title: "Recommended Implementation Plan", categories: [] },
  { number: 23, title: "Agent-Specific Execution Instructions", categories: [] },
  { number: 24, title: "Validation Results", categories: [] },
  { number: 25, title: "Remaining User Decisions", categories: [] },
  { number: 26, title: "Appendix: Evidence", categories: [] },
  { number: 27, title: "Final Agent Execution Plan", categories: [] }
];

export const REPORT_CONTRACT_VERSION = "2026-07-06.execution-cockpit";

export const REQUIRED_REPORT_FILES = [
  "index.md",
  "index.html",
  "scan-result.json",
  "findings.json",
  "score.json",
  "report-dashboard.json",
  "evidence.jsonl",
  "remediation-plan.json",
  "validation.json",
  "patch.diff",
  "patch-plan.md",
  "changed-files.json",
  "framework-actions.json",
  "manual-actions.md",
  "crawl-graph.json",
  "crawl-graph.svg",
  "raw-render-diff.json",
  "response-index.json",
  "header-index.json",
  "body-excerpts.json",
  "tech-stack.json",
  "repo-analysis.json",
  "route-templates.json",
  "performance-audit.json",
  "resource-timing.json",
  "performance-runs.jsonl",
  "third-party-cost.json",
  "largest-assets.json",
  "critical-request-chain.json",
  "actionability.json",
  "baseline-comparison.json",
  "suppression-report.json",
  "quality-gate.json",
  "production-readiness.json",
  "internal-link-opportunities.json",
  "orphan-pages.csv",
  "deep-pages.csv",
  "executive-summary.md",
  "priority-action-plan.md",
  "agent-execution-plan.md",
  "github-pr-comment.md",
  "before-after-score.json",
  "remaining-user-decisions.md",
  "standards-registry.json",
  "agent-instructions/README.md",
  "agent-instructions/codex.md",
  "agent-instructions/claude-code.md",
  "agent-instructions/gemini-cli.md",
  "agent-instructions/openclaw.md",
  "agent-instructions/hermes.md"
] as const;

export const OPTIONAL_REPORT_FILES = ["benchmark.json", "benchmark.md"] as const;

export function sectionHeading(section: ReportSection): string {
  return `## ${section.number}. ${section.title}`;
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { benchmarkAgentExperience } from "@seo-polish/benchmark";
import { runApply, runPlan, runScan, runValidate } from "@seo-polish/core";
import type { Finding, ScanResult } from "@seo-polish/schemas";
import type { ToolCall, ToolResult } from "./tools.js";

export async function dispatchTool(call: ToolCall): Promise<ToolResult> {
  switch (call.name) {
    case "scan_site": {
      const url = stringInput(call.input, "url");
      const outputDir = optionalStringInput(call.input, "outputDir") ?? "seo-polish-report";
      const summary = await runScan({ url, outputDir });
      return { ok: true, content: summary };
    }
    case "get_findings": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      return { ok: true, content: JSON.parse(await readFile(join(reportDir, "findings.json"), "utf8")) };
    }
    case "get_report": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      return { ok: true, content: await readFile(join(reportDir, "index.md"), "utf8") };
    }
    case "create_remediation_plan": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      await runPlan(join(reportDir, "findings.json"), join(reportDir, "remediation-plan.json"));
      return { ok: true, content: { reportDir } };
    }
    case "apply_patch": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      await runApply(join(reportDir, "remediation-plan.json"), reportDir);
      return { ok: true, content: { mode: "diff-only", reportDir } };
    }
    case "validate_site":
    case "validate_report": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      return { ok: true, content: await runValidate(reportDir, true) };
    }
    case "explain_finding": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      const findingId = stringInput(call.input, "findingId");
      const findings = JSON.parse(await readFile(join(reportDir, "findings.json"), "utf8")) as Finding[];
      return { ok: true, content: findings.find((finding) => finding.id === findingId) ?? null };
    }
    case "generate_llms_txt":
      return { ok: true, content: generateLlmsTxt(originInput(call.input)) };
    case "generate_robots_txt":
      return { ok: true, content: generateRobotsTxt(originInput(call.input)) };
    case "generate_agent_skills":
      return { ok: true, content: generateAgentSkills(originInput(call.input)) };
    case "generate_api_catalog":
      return { ok: true, content: generateApiCatalog(originInput(call.input)) };
    case "generate_mcp_card":
      return { ok: true, content: generateMcpCard(originInput(call.input)) };
    case "generate_a2a_card":
      return { ok: true, content: generateA2aCard(originInput(call.input)) };
    case "benchmark_agent_experience": {
      const reportDir = optionalStringInput(call.input, "reportDir") ?? "seo-polish-report";
      const scan = JSON.parse(await readFile(join(reportDir, "scan-result.json"), "utf8")) as ScanResult;
      const findings = JSON.parse(await readFile(join(reportDir, "findings.json"), "utf8")) as Finding[];
      return { ok: true, content: benchmarkAgentExperience(scan, findings) };
    }
  }
}

function generateRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /account/
Disallow: /login
Disallow: /logout
Disallow: /checkout/
Disallow: /cart/
Disallow: /payment/
Disallow: /preview/
Disallow: /api/internal/
Sitemap: ${origin}/sitemap.xml
# Content Signals require explicit owner decision.
# search={{YES_NO_OR_NEUTRAL}}
# ai-input={{ASK}}
# ai-train={{ASK}}
`;
}

function generateLlmsTxt(origin: string): string {
  const hostname = new URL(origin).hostname;
  return `# ${hostname}
> Canonical public website entry point for AI agents.

## Primary pages
- [Home](${origin}/)
- [Documentation](${origin}/docs/)
- [Support](${origin}/support/)

## For AI agents
- Sitemap: ${origin}/sitemap.xml
- API Catalog: ${origin}/.well-known/api-catalog
- Agent Skills: ${origin}/.well-known/agent-skills/index.json
- MCP: ${origin}/.well-known/mcp.json

## Recommended agent path
1. Read this file.
2. Use the sitemap to find canonical public pages.
3. Prefer Markdown responses when available.
4. Use API Catalog, Agent Skills or MCP for structured actions.
5. Do not crawl account, admin, checkout, cart, login, preview or internal API paths.

## Content policy
See ${origin}/robots.txt.
`;
}

function generateAgentSkills(origin: string): unknown {
  return {
    skills: [
      {
        name: `use-${new URL(origin).hostname.replace(/[^a-z0-9]+/gi, "-")}`,
        type: "skill-md",
        description: "Find canonical public content and avoid private or deprecated paths.",
        url: "/.well-known/agent-skills/use-site/SKILL.md"
      }
    ]
  };
}

function generateApiCatalog(origin: string): unknown {
  return {
    linkset: [
      {
        anchor: origin,
        "service-doc": [
          {
            href: `${origin}/docs/api`,
            type: "text/html",
            title: "API documentation"
          }
        ]
      }
    ]
  };
}

function generateMcpCard(origin: string): unknown {
  return {
    name: new URL(origin).hostname,
    description: "Read-only public website discovery tools.",
    transport: "https",
    auth: "none for read-only public tools",
    approval: "required for mutating, authenticated, paid or externally visible actions",
    tools: []
  };
}

function generateA2aCard(origin: string): unknown {
  return {
    name: new URL(origin).hostname,
    url: `${origin}/.well-known/agent-card.json`,
    capabilities: ["public-content-discovery"],
    approvalRequiredFor: ["auth", "payment", "mutation", "account access"]
  };
}

function originInput(input: Record<string, unknown>): string {
  const raw =
    optionalStringInput(input, "url") ?? optionalStringInput(input, "origin") ?? "https://example.com";
  return new URL(raw).origin;
}

function stringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string input: ${key}`);
  }
  return value;
}

function optionalStringInput(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runApply, runPlan, runScan, runValidate } from "@seo-polish/core";
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
      const findings = JSON.parse(await readFile(join(reportDir, "findings.json"), "utf8")) as Array<{
        id: string;
      }>;
      return { ok: true, content: findings.find((finding) => finding.id === findingId) ?? null };
    }
    case "generate_llms_txt":
      return { ok: true, content: "# Example\n> Canonical public website entry point for AI agents.\n" };
    case "generate_robots_txt":
      return {
        ok: true,
        content:
          "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nSitemap: https://example.com/sitemap.xml\n"
      };
    case "generate_agent_skills":
      return { ok: true, content: { skills: [] } };
    case "generate_api_catalog":
      return { ok: true, content: { linkset: [] } };
    case "generate_mcp_card":
      return { ok: true, content: { name: "example", tools: [] } };
    case "generate_a2a_card":
      return { ok: true, content: { name: "example", capabilities: [] } };
    case "benchmark_agent_experience":
      return { ok: true, content: { status: "not_configured", metrics: [] } };
  }
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

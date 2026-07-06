#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  runApply,
  runPlan,
  runReportLint,
  runReportRender,
  runScan,
  runValidate,
  type RenderJsMode,
  type SiteType
} from "@seo-polish/core";

interface ParsedArgs {
  command: string[];
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const [command, subcommand] = args.command;

  if (!command || command === "help" || args.flags.help) {
    printHelp();
    return;
  }

  if (command === "scan") {
    const url = args.positionals[0];
    if (!url) {
      throw new Error("Usage: seo-polish scan <url>");
    }
    const summary = await runScan({
      url,
      outputDir: flagString(args, "output", DEFAULT_CONFIG.outputDir),
      maxPages: flagNumber(args, "max-pages", DEFAULT_CONFIG.maxPages),
      maxDepth: flagNumber(args, "max-depth", DEFAULT_CONFIG.maxDepth),
      renderJs: flagString(args, "render-js", DEFAULT_CONFIG.renderJs) as RenderJsMode,
      siteType: flagString(args, "site-type", DEFAULT_CONFIG.siteType) as SiteType,
      includeExperimentalStandards: Boolean(
        args.flags["include-experimental"] ?? DEFAULT_CONFIG.includeExperimentalStandards
      )
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "plan") {
    await runPlan(
      flagString(args, "scan", "seo-polish-report/findings.json"),
      flagString(args, "output", "seo-polish-report/remediation-plan.json")
    );
    console.log("Remediation plan written.");
    return;
  }

  if (command === "apply") {
    if (flagString(args, "mode", "diff-only") !== "diff-only") {
      console.warn("Only diff-only apply mode is enabled in this safety-first release.");
    }
    await runApply(
      flagString(args, "plan", "seo-polish-report/remediation-plan.json"),
      flagString(args, "output", "seo-polish-report")
    );
    console.log("Patch proposal written.");
    return;
  }

  if (command === "validate") {
    const result = await runValidate(
      flagString(args, "report", "seo-polish-report"),
      Boolean(args.flags.strict ?? true)
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "report" && subcommand === "lint") {
    const reportDir = args.positionals[0] ?? "seo-polish-report";
    const result = await runReportLint(reportDir, Boolean(args.flags.strict));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "report" && subcommand === "render") {
    const reportDir = args.positionals[0] ?? "seo-polish-report";
    await runReportRender(reportDir);
    console.log("Report rendered.");
    return;
  }

  if (command === "policy" && subcommand === "init") {
    await writeFile(
      flagString(args, "output", "seo-polish.config.json"),
      `${JSON.stringify(
        {
          siteType: "auto",
          maxPages: 500,
          renderJs: "auto",
          respectRobotsTxt: true,
          outputDir: "seo-polish-report",
          policy: DEFAULT_CONFIG.policy
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log("Policy config written.");
    return;
  }

  if (command === "standards" && subcommand === "update") {
    console.log(
      "Standards registry is bundled in @seo-polish/standards-registry. No remote update source is configured."
    );
    return;
  }

  if (command === "benchmark") {
    await writeFile(
      join(flagString(args, "output", "seo-polish-report"), "benchmark.json"),
      `${JSON.stringify({ status: "not_configured", metrics: [] }, null, 2)}\n`,
      "utf8"
    );
    console.log("Benchmark placeholder written.");
    return;
  }

  if (command === "doctor") {
    console.log(
      JSON.stringify(
        {
          node: process.version,
          cwd: process.cwd(),
          defaultOutput: DEFAULT_CONFIG.outputDir,
          status: "ok"
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${args.command.join(" ")}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];
  const command: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
      continue;
    }
    if (
      command.length === 0 ||
      (command[0] === "report" && command.length === 1) ||
      (command[0] === "policy" && command.length === 1) ||
      (command[0] === "standards" && command.length === 1)
    ) {
      command.push(token);
    } else {
      positionals.push(token);
    }
  }

  return { command, flags, positionals };
}

function flagString(args: ParsedArgs, key: string, fallback: string): string {
  const value = args.flags[key];
  if (typeof value === "string") return value;
  return fallback;
}

function flagNumber(args: ParsedArgs, key: string, fallback: number): number {
  const value = args.flags[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function printHelp(): void {
  console.log(`SEO polish workflow

Usage:
  seo-polish scan <url> [--output ./seo-polish-report] [--max-pages 50]
  seo-polish plan --scan ./seo-polish-report/findings.json
  seo-polish apply --plan ./seo-polish-report/remediation-plan.json --mode diff-only
  seo-polish validate --report ./seo-polish-report
  seo-polish report lint ./seo-polish-report --strict
  seo-polish report render ./seo-polish-report
  seo-polish policy init
  seo-polish standards update
  seo-polish benchmark
  seo-polish doctor
`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

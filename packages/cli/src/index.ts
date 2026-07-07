#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { benchmarkAgentExperience, renderBenchmarkMarkdown } from "@seo-polish/benchmark";
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
import {
  buildFixtureAgentReview,
  buildReportDashboard,
  renderAgentExecutionPlan,
  writeReportBundle,
  type AgentExecutionPlanBenchmark
} from "@seo-polish/reporters";
import type {
  Finding,
  FieldDataProvider,
  PerformanceBudget,
  ReportDashboard,
  ReportBundle,
  ScanResult,
  ValidationResult,
  ValidationStatus
} from "@seo-polish/schemas";
import { buildStandardsSnapshot, validateStandardsRegistry } from "@seo-polish/standards-registry";

interface ParsedArgs {
  command: string[];
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
}

async function main(argv: string[]): Promise<void> {
  restoreInvocationCwd();
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
    const repoPath = flagOptionalString(args, "repo");
    const framework = flagOptionalString(args, "framework");
    const baselinePath = flagOptionalString(args, "baseline");
    const suppressionsFile = flagOptionalString(args, "suppressions");
    const gscSiteUrl = flagOptionalString(args, "gsc-site");
    const gscDateStart = flagOptionalString(args, "gsc-start");
    const gscDateEnd = flagOptionalString(args, "gsc-end");
    const rumDataPath = flagOptionalString(args, "rum-file");
    const requestedFieldDataProviders = fieldDataProviders(args);
    const budgets = budgetOverrides(args);
    const summary = await runScan({
      url,
      outputDir: flagString(args, "output", DEFAULT_CONFIG.outputDir),
      maxPages: flagNumber(args, "max-pages", DEFAULT_CONFIG.maxPages),
      maxDepth: flagNumber(args, "max-depth", DEFAULT_CONFIG.maxDepth),
      renderJs: flagString(args, "render-js", DEFAULT_CONFIG.renderJs) as RenderJsMode,
      siteType: flagString(args, "site-type", DEFAULT_CONFIG.siteType) as SiteType,
      includeBrowserEvidence: flagBoolean(args, "browser-evidence", DEFAULT_CONFIG.includeBrowserEvidence),
      includeCoreWebVitals: flagBoolean(args, "core-web-vitals", DEFAULT_CONFIG.includeCoreWebVitals),
      gscRowLimit: flagNumber(args, "gsc-row-limit", DEFAULT_CONFIG.gscRowLimit ?? 250),
      gscInspectionLimit: flagNumber(args, "gsc-inspection-limit", DEFAULT_CONFIG.gscInspectionLimit ?? 5),
      includeCruxHistory: flagBoolean(args, "crux-history", DEFAULT_CONFIG.includeCruxHistory ?? false),
      fieldDataUrlLimit: flagNumber(args, "field-data-url-limit", DEFAULT_CONFIG.fieldDataUrlLimit ?? 3),
      performanceRuns: flagNumber(args, "performance-runs", DEFAULT_CONFIG.performanceRuns ?? 1),
      ...(repoPath ? { repoPath } : {}),
      ...(framework ? { framework } : {}),
      ...(baselinePath ? { baselinePath } : {}),
      ...(suppressionsFile ? { suppressionsFile } : {}),
      ...(requestedFieldDataProviders ? { fieldDataProviders: requestedFieldDataProviders } : {}),
      ...(gscSiteUrl ? { gscSiteUrl } : {}),
      ...(gscDateStart ? { gscDateStart } : {}),
      ...(gscDateEnd ? { gscDateEnd } : {}),
      ...(rumDataPath ? { rumDataPath } : {}),
      ...(Object.keys(budgets).length > 0 ? { performanceBudgets: budgets } : {}),
      includeExperimentalStandards: Boolean(
        args.flags["include-experimental"] ?? DEFAULT_CONFIG.includeExperimentalStandards
      )
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === "plan" && subcommand === "build") {
    const reportDir = flagString(args, "report", flagString(args, "output", "seo-polish-report"));
    const outputPath = flagString(args, "output-file", join(reportDir, "agent-execution-plan.md"));
    const bundle = await readReportBundle(reportDir);
    const benchmark = await readOptionalJson<AgentExecutionPlanBenchmark>(join(reportDir, "benchmark.json"));
    const dashboard = await readOptionalJson<ReportDashboard>(join(reportDir, "report-dashboard.json"));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      renderAgentExecutionPlan(bundle, { benchmark, ...(dashboard ? { dashboard } : {}) }),
      "utf8"
    );
    console.log(JSON.stringify({ outputPath, benchmarkIncluded: Boolean(benchmark) }, null, 2));
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
    printValidationResult(result, args);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "report" && subcommand === "lint") {
    const reportDir = args.positionals[0] ?? "seo-polish-report";
    const result = await runReportLint(reportDir, Boolean(args.flags.strict));
    printValidationResult(result, args);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "report" && subcommand === "render") {
    const reportDir = args.positionals[0] ?? "seo-polish-report";
    await runReportRender(reportDir);
    console.log("Report rendered.");
    return;
  }

  if (command === "agent-review" && subcommand === "fixture") {
    const reportDir = flagString(args, "report", args.positionals[0] ?? "seo-polish-report");
    const bundle = await readReportBundle(reportDir);
    const dashboard =
      (await readOptionalJson<ReportDashboard>(join(reportDir, "report-dashboard.json"))) ??
      buildReportDashboard(bundle);
    const agentReview = buildFixtureAgentReview(bundle, dashboard);
    const benchmark = await readOptionalJson<AgentExecutionPlanBenchmark>(join(reportDir, "benchmark.json"));
    await writeReportBundle(reportDir, bundle, { dashboard, benchmark, agentReview });
    await runReportRender(reportDir);
    console.log(
      JSON.stringify({ reportDir, status: agentReview.status, reviewer: agentReview.reviewer }, null, 2)
    );
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
          fieldDataProviders: [],
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
    const outputPath = flagString(args, "output", "seo-polish-report/standards-registry.json");
    const validation = validateStandardsRegistry();
    const snapshot = {
      ...buildStandardsSnapshot(),
      validation
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const failedChecks = validation.checks.filter((check) => check.status === "failed");
    console.log(
      JSON.stringify(
        {
          outputPath,
          standards: {
            ok: validation.ok,
            checks: validation.checks.length,
            failed: failedChecks.length,
            failedChecks: failedChecks.map((check) => check.id)
          }
        },
        null,
        2
      )
    );
    process.exitCode = validation.ok ? 0 : 1;
    return;
  }

  if (command === "benchmark") {
    const reportDir = flagString(args, "report", flagString(args, "output", "seo-polish-report"));
    const scan = await readJson<ScanResult>(join(reportDir, "scan-result.json"));
    const findings = await readJson<Finding[]>(join(reportDir, "findings.json"));
    const result = benchmarkAgentExperience(scan, findings);
    await mkdir(reportDir, { recursive: true });
    await writeFile(join(reportDir, "benchmark.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await writeFile(join(reportDir, "benchmark.md"), renderBenchmarkMarkdown(result), "utf8");
    const bundle = await readReportBundle(reportDir);
    const dashboard = await readOptionalJson<ReportDashboard>(join(reportDir, "report-dashboard.json"));
    await writeFile(
      join(reportDir, "agent-execution-plan.md"),
      renderAgentExecutionPlan(bundle, { benchmark: result, ...(dashboard ? { dashboard } : {}) }),
      "utf8"
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "doctor") {
    const standards = validateStandardsRegistry();
    console.log(
      JSON.stringify(
        {
          node: process.version,
          cwd: process.cwd(),
          packageManager: "pnpm@11.10.0",
          defaultOutput: DEFAULT_CONFIG.outputDir,
          commands: [
            "scan",
            "plan",
            "apply",
            "validate",
            "plan build",
            "report lint",
            "report render",
            "agent-review fixture",
            "policy init",
            "standards update",
            "benchmark",
            "doctor"
          ],
          safetyDefaults: DEFAULT_CONFIG.policy,
          standards: {
            ok: standards.ok,
            checks: standards.checks.length,
            failed: standards.checks.filter((check) => check.status === "failed").length
          },
          status: standards.ok ? "ok" : "failed"
        },
        null,
        2
      )
    );
    process.exitCode = standards.ok ? 0 : 1;
    return;
  }

  throw new Error(`Unknown command: ${args.command.join(" ")}`);
}

function restoreInvocationCwd(): void {
  const initCwd = process.env.INIT_CWD;
  if (!initCwd || initCwd === process.cwd()) {
    return;
  }
  try {
    process.chdir(initCwd);
  } catch {
    // Keep the package working directory when the package manager supplied an invalid INIT_CWD.
  }
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
      (command[0] === "plan" && command.length === 1) ||
      (command[0] === "agent-review" && command.length === 1) ||
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

function flagOptionalString(args: ParsedArgs, key: string): string | undefined {
  const value = args.flags[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function flagBoolean(args: ParsedArgs, key: string, fallback: boolean): boolean {
  const value = args.flags[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function fieldDataProviders(args: ParsedArgs): FieldDataProvider[] | undefined {
  const value = args.flags["field-data"];
  if (typeof value !== "string") return undefined;
  const providers = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .flatMap((item) => (item === "all" ? ["crux", "gsc", "rum"] : item === "none" ? [] : [item]));
  const valid = new Set<FieldDataProvider>(["crux", "gsc", "rum"]);
  return [...new Set(providers)].filter((provider): provider is FieldDataProvider =>
    valid.has(provider as FieldDataProvider)
  );
}

function budgetOverrides(args: ParsedArgs): PerformanceBudget {
  const budget: PerformanceBudget = {};
  setBudgetNumber(args, budget, "budget-lcp-ms", "lcpMs");
  setBudgetNumber(args, budget, "budget-inp-ms", "inpMs");
  setBudgetNumber(args, budget, "budget-cls", "cls");
  setBudgetNumber(args, budget, "budget-ttfb-ms", "ttfbMs");
  setBudgetNumber(args, budget, "budget-document-fetch-ms", "documentFetchMs");
  setBudgetNumber(args, budget, "budget-total-js-kb", "totalJsKb");
  setBudgetNumber(args, budget, "budget-third-party-js-kb", "thirdPartyJsKb");
  setBudgetNumber(args, budget, "budget-total-css-kb", "totalCssKb");
  setBudgetNumber(args, budget, "budget-image-kb", "imageBytesKb");
  setBudgetNumber(args, budget, "budget-render-blocking", "renderBlockingRequests");
  setBudgetNumber(args, budget, "budget-total-requests", "totalRequests");
  return budget;
}

function setBudgetNumber(
  args: ParsedArgs,
  budget: PerformanceBudget,
  flag: string,
  key: keyof PerformanceBudget
): void {
  const value = args.flags[flag];
  if (typeof value !== "string") {
    return;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    budget[key] = parsed;
  }
}

function printValidationResult(result: ValidationResult, args: ParsedArgs): void {
  const format = flagString(args, "format", args.flags.full ? "full" : "summary");
  console.log(
    JSON.stringify(format === "full" || format === "json" ? result : summarizeValidation(result), null, 2)
  );
}

function summarizeValidation(result: ValidationResult): {
  ok: boolean;
  generatedAt: string;
  checks: Record<ValidationStatus, number> & { total: number };
  attention: Array<{ id: string; title: string; status: ValidationStatus; message: string }>;
  fullOutput: string;
} {
  const counts = result.checks.reduce<Record<ValidationStatus, number>>(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, warning: 0, not_applicable: 0 }
  );
  return {
    ok: result.ok,
    generatedAt: result.generatedAt,
    checks: { total: result.checks.length, ...counts },
    attention: result.checks
      .filter((check) => check.status === "failed" || check.status === "warning")
      .slice(0, 20)
      .map((check) => ({
        id: check.id,
        title: check.title,
        status: check.status,
        message: check.message
      })),
    fullOutput: "Use --full to print every validation check."
  };
}

function printHelp(): void {
  console.log(`SEO polish workflow

Usage:
  seo-polish scan <url> [--output ./seo-polish-report] [--max-pages 50] [--repo ../site]
                   [--browser-evidence] [--core-web-vitals] [--performance-runs 3] [--baseline ./previous-report]
                   [--field-data crux,gsc,rum] [--gsc-site sc-domain:example.com] [--rum-file ./rum-vitals.json]
                   [--budget-total-js-kb 250] [--suppressions ./suppressions.json]
  seo-polish plan --scan ./seo-polish-report/findings.json
  seo-polish plan build --report ./seo-polish-report
  seo-polish apply --plan ./seo-polish-report/remediation-plan.json --mode diff-only
  seo-polish validate --report ./seo-polish-report [--format summary|full|json]
  seo-polish report lint ./seo-polish-report --strict [--format summary|full|json]
  seo-polish report render ./seo-polish-report
  seo-polish agent-review fixture --report ./seo-polish-report
  seo-polish policy init
  seo-polish standards update --output ./seo-polish-report/standards-registry.json
  seo-polish benchmark --report ./seo-polish-report
  seo-polish doctor
`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function readReportBundle(reportDir: string): Promise<ReportBundle> {
  return {
    scan: await readJson<ReportBundle["scan"]>(join(reportDir, "scan-result.json")),
    findings: await readJson<ReportBundle["findings"]>(join(reportDir, "findings.json")),
    score: await readJson<ReportBundle["score"]>(join(reportDir, "score.json")),
    remediationPlan: await readJson<ReportBundle["remediationPlan"]>(
      join(reportDir, "remediation-plan.json")
    ),
    validation: await readJson<ReportBundle["validation"]>(join(reportDir, "validation.json")),
    patchDiff: await readFile(join(reportDir, "patch.diff"), "utf8")
  };
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

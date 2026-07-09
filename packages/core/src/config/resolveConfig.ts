import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ScanConfig } from "@seo-polish/schemas";
import { auditSlugForTarget, initialAuditOutputDir } from "./auditOutput.js";
import { DEFAULT_CONFIG } from "./defaultConfig.js";

export type ScanConfigInput = Partial<ScanConfig> & { url: string };

export async function resolveConfig(input: ScanConfigInput): Promise<ScanConfig> {
  const fileConfig = await readConfigFile(input.repoPath ?? process.cwd());
  const envConfig = readEnvConfig();
  const hasExplicitOutput =
    hasOwn(input, "outputDir") || hasOwn(fileConfig, "outputDir") || hasOwn(envConfig, "outputDir");

  const mergedBase: ScanConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...input,
    performanceBudgets: {
      ...(DEFAULT_CONFIG.performanceBudgets ?? {}),
      ...(fileConfig.performanceBudgets ?? {}),
      ...(envConfig.performanceBudgets ?? {}),
      ...(input.performanceBudgets ?? {})
    },
    policy: {
      ...DEFAULT_CONFIG.policy,
      ...(fileConfig.policy ?? {}),
      ...(envConfig.policy ?? {}),
      ...(input.policy ?? {})
    }
  };

  const auditSlug = mergedBase.auditSlug || auditSlugForTarget(mergedBase.url, mergedBase.auditName);
  const merged: ScanConfig = {
    ...mergedBase,
    auditSlug,
    auditOutputMode: hasExplicitOutput ? "explicit" : "auto",
    outputDir: hasExplicitOutput ? mergedBase.outputDir : initialAuditOutputDir({ ...mergedBase, auditSlug })
  };

  const suppressionsFromFile = merged.suppressionsFile
    ? await readSuppressionsFile(merged.suppressionsFile, input.repoPath ?? process.cwd())
    : [];
  const resolved = {
    ...merged,
    suppressions: [...(merged.suppressions ?? []), ...suppressionsFromFile]
  };
  validateResolvedConfig(resolved);
  return resolved;
}

async function readConfigFile(cwd: string): Promise<Partial<ScanConfig>> {
  const candidates = ["seo-polish.config.json", "package.json"];
  for (const candidate of candidates) {
    let raw: string;
    try {
      raw = await readFile(new URL(candidate, `file://${cwd.replace(/\/$/, "")}/`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw new Error(`Could not read ${candidate} from ${cwd}: ${errorMessage(error)}`, {
        cause: error
      });
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid JSON in ${candidate}: ${errorMessage(error)}`, { cause: error });
    }
    if (candidate === "package.json") {
      return (json["seo-polish"] as Partial<ScanConfig> | undefined) ?? {};
    }
    return normalizeConfigObject(json);
  }
  return {};
}

function readEnvConfig(): Partial<ScanConfig> {
  const config: Partial<ScanConfig> = {};
  if (process.env.SEO_POLISH_MAX_PAGES) {
    config.maxPages = Number(process.env.SEO_POLISH_MAX_PAGES);
  }
  if (process.env.SEO_POLISH_OUTPUT_DIR) {
    config.outputDir = process.env.SEO_POLISH_OUTPUT_DIR;
  }
  if (process.env.SEO_POLISH_AUDIT_ROOT) {
    config.auditRoot = process.env.SEO_POLISH_AUDIT_ROOT;
  }
  if (process.env.SEO_POLISH_AUDIT_NAME) {
    config.auditName = process.env.SEO_POLISH_AUDIT_NAME;
  }
  if (process.env.SEO_POLISH_FIELD_DATA) {
    config.fieldDataProviders = normalizeFieldDataProviders(process.env.SEO_POLISH_FIELD_DATA);
  }
  if (process.env.SEO_POLISH_GSC_SITE) {
    config.gscSiteUrl = process.env.SEO_POLISH_GSC_SITE;
  }
  if (process.env.SEO_POLISH_RUM_FILE) {
    config.rumDataPath = process.env.SEO_POLISH_RUM_FILE;
  }
  return config;
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeFieldDataProviders(value: string): ScanConfig["fieldDataProviders"] {
  const valid = new Set<ScanConfig["fieldDataProviders"][number]>(["crux", "gsc", "rum"]);
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .flatMap((item) => (item === "all" ? ["crux", "gsc", "rum"] : item === "none" ? [] : [item]))
    )
  ].filter((provider): provider is ScanConfig["fieldDataProviders"][number] =>
    valid.has(provider as ScanConfig["fieldDataProviders"][number])
  );
}

function normalizeConfigObject(json: Record<string, unknown>): Partial<ScanConfig> {
  const config = { ...json } as Partial<ScanConfig> & { siteUrl?: string };
  if (config.siteUrl && !config.url) {
    config.url = config.siteUrl;
  }
  delete config.siteUrl;
  return config;
}

async function readSuppressionsFile(
  path: string,
  cwd: string
): Promise<NonNullable<ScanConfig["suppressions"]>> {
  const absolute = path.startsWith("/") ? path : resolve(cwd, path);
  try {
    const raw = await readFile(absolute, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as NonNullable<ScanConfig["suppressions"]>;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { suppressions?: unknown }).suppressions)
    ) {
      return (parsed as { suppressions: NonNullable<ScanConfig["suppressions"]> }).suppressions;
    }
  } catch {
    // Invalid suppression files are surfaced by the generated suppression report as unmatched config.
  }
  return [];
}

function validateResolvedConfig(config: ScanConfig): void {
  let target: URL;
  try {
    target = new URL(config.url);
  } catch {
    throw new Error(`Invalid scan URL: ${config.url}`);
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error(`Scan URL must use http or https: ${config.url}`);
  }
  assertIntegerRange("maxPages", config.maxPages, 1, 10_000);
  assertIntegerRange("maxDepth", config.maxDepth, 0, 100);
  assertIntegerRange("timeoutMs", config.timeoutMs, 100, 120_000);
  assertIntegerRange("concurrency", config.concurrency, 1, 64);
  assertIntegerRange("performanceRuns", config.performanceRuns ?? 1, 1, 20);
  assertIntegerRange("gscRowLimit", config.gscRowLimit ?? 250, 1, 25_000);
  assertIntegerRange("gscInspectionLimit", config.gscInspectionLimit ?? 5, 0, 2_000);
  assertIntegerRange("fieldDataUrlLimit", config.fieldDataUrlLimit ?? 3, 1, 500);
  if (!["auto", "never", "always"].includes(config.renderJs)) {
    throw new Error(`Invalid renderJs value: ${String(config.renderJs)}`);
  }
  if (config.suppressions) {
    const seen = new Set<string>();
    for (const suppression of config.suppressions) {
      if (!suppression.id || !suppression.findingId || !suppression.reason) {
        throw new Error("Every suppression requires id, findingId and reason.");
      }
      if (seen.has(suppression.id)) {
        throw new Error(`Duplicate suppression id: ${suppression.id}`);
      }
      seen.add(suppression.id);
    }
  }
}

function assertIntegerRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}; received ${String(value)}.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

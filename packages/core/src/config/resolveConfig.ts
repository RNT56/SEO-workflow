import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ScanConfig } from "@seo-polish/schemas";
import { DEFAULT_CONFIG } from "./defaultConfig.js";

export type ScanConfigInput = Partial<ScanConfig> & { url: string };

export async function resolveConfig(input: ScanConfigInput): Promise<ScanConfig> {
  const fileConfig = await readConfigFile(input.repoPath ?? process.cwd());
  const envConfig = readEnvConfig();

  const merged: ScanConfig = {
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

  const suppressionsFromFile = merged.suppressionsFile
    ? await readSuppressionsFile(merged.suppressionsFile, input.repoPath ?? process.cwd())
    : [];
  return {
    ...merged,
    suppressions: [...(merged.suppressions ?? []), ...suppressionsFromFile]
  };
}

async function readConfigFile(cwd: string): Promise<Partial<ScanConfig>> {
  const candidates = ["seo-polish.config.json", "package.json"];
  for (const candidate of candidates) {
    try {
      const raw = await readFile(new URL(candidate, `file://${cwd.replace(/\/$/, "")}/`), "utf8");
      const json = JSON.parse(raw) as Record<string, unknown>;
      if (candidate === "package.json") {
        return (json["seo-polish"] as Partial<ScanConfig> | undefined) ?? {};
      }
      return normalizeConfigObject(json);
    } catch {
      // Continue to the next source.
    }
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

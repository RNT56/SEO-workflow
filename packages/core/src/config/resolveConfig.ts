import { readFile } from "node:fs/promises";
import type { ScanConfig } from "@seo-polish/schemas";
import { DEFAULT_CONFIG } from "./defaultConfig.js";

export type ScanConfigInput = Partial<ScanConfig> & { url: string };

export async function resolveConfig(input: ScanConfigInput): Promise<ScanConfig> {
  const fileConfig = await readConfigFile(input.repoPath ?? process.cwd());
  const envConfig = readEnvConfig();

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...input,
    policy: {
      ...DEFAULT_CONFIG.policy,
      ...(fileConfig.policy ?? {}),
      ...(envConfig.policy ?? {}),
      ...(input.policy ?? {})
    }
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
  return config;
}

function normalizeConfigObject(json: Record<string, unknown>): Partial<ScanConfig> {
  const config = { ...json } as Partial<ScanConfig> & { siteUrl?: string };
  if (config.siteUrl && !config.url) {
    config.url = config.siteUrl;
  }
  delete config.siteUrl;
  return config;
}

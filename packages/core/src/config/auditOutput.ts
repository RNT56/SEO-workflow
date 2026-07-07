import { join } from "node:path";
import type { ScanConfig } from "@seo-polish/schemas";

export const DEFAULT_AUDIT_ROOT = "audit-reports";

export function auditSlugForTarget(targetUrl: string, auditName?: string): string {
  const source = auditName?.trim() || hostLabel(targetUrl);
  const slug = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "site-audit";
}

export function auditTimestamp(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}${minutes}${seconds}Z`;
}

export function initialAuditOutputDir(config: ScanConfig, date = new Date()): string {
  const auditRoot = config.auditRoot || DEFAULT_AUDIT_ROOT;
  const auditSlug = config.auditSlug || auditSlugForTarget(config.url, config.auditName);
  const auditRunId = config.auditRunId || auditTimestamp(date);
  return join(auditRoot, auditSlug, auditRunId);
}

export function finalizeAuditOutputConfig(config: ScanConfig, scanId: string): ScanConfig {
  if (config.auditOutputMode !== "auto") {
    return { ...config, auditOutputMode: "explicit" };
  }

  const auditRoot = config.auditRoot || DEFAULT_AUDIT_ROOT;
  const auditSlug = config.auditSlug || auditSlugForTarget(config.url, config.auditName);
  const baseRunId = config.auditRunId || auditTimestamp();
  const auditRunId = baseRunId.endsWith(`-${scanId}`) ? baseRunId : `${baseRunId}-${scanId}`;
  return {
    ...config,
    auditRoot,
    auditSlug,
    auditRunId,
    auditOutputMode: "auto",
    outputDir: join(auditRoot, auditSlug, auditRunId)
  };
}

function hostLabel(targetUrl: string): string {
  try {
    const host = new URL(targetUrl).hostname.replace(/^www\./i, "");
    return host.replace(/\./g, "-");
  } catch {
    return targetUrl;
  }
}

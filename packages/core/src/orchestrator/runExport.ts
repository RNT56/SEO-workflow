import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { ScanResult } from "@seo-polish/schemas";
import { auditSlugForTarget, auditTimestamp } from "../config/auditOutput.js";

export type AuditExportProfile = "review" | "full" | "repo-import" | "learnings";
export type AuditExportFormat = "zip" | "directory";

export interface AuditExportOptions {
  reportDir: string;
  profile?: AuditExportProfile;
  format?: AuditExportFormat;
  outputPath?: string;
  includePrivatePaths?: boolean;
  overwrite?: boolean;
}

export interface AuditExportSummary {
  reportDir: string;
  profile: AuditExportProfile;
  format: AuditExportFormat;
  outputPath: string;
  files: number;
  bytes: number;
  manifestPath: string;
  checksumsPath: string;
  localPathsRedacted: boolean;
}

interface ExportEntry {
  path: string;
  content: Buffer;
}

interface ExportManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

const REVIEW_FILES = new Set([
  "index.html",
  "index.md",
  "executive-summary.md",
  "final-audit.md",
  "copy-recommendations.md",
  "agent-execution-plan.md",
  "priority-action-plan.md",
  "report-dashboard.json",
  "findings.json",
  "score.json",
  "quality-gate.json",
  "production-readiness.json",
  "validation.json",
  "benchmark.json",
  "benchmark.md",
  "agent-review.json",
  "search-intent-review.json",
  "agent-skills-review.json",
  "copy-recommendations.json",
  "manual-actions.md",
  "remaining-user-decisions.md",
  "audit-run.json"
]);

const REPO_IMPORT_FILES = new Set([
  "agent-execution-plan.md",
  "agent-review-input.json",
  "agent-review.json",
  "report-dashboard.json",
  "findings.json",
  "score.json",
  "remediation-plan.json",
  "actionability.json",
  "repo-analysis.json",
  "tech-stack.json",
  "route-templates.json",
  "browser-evidence.json",
  "field-data.json",
  "performance-audit.json",
  "resource-timing.json",
  "baseline-comparison.json",
  "suppression-report.json",
  "quality-gate.json",
  "production-readiness.json",
  "validation.json",
  "standards-registry.json",
  "patch.diff",
  "patch-plan.md",
  "changed-files.json",
  "framework-actions.json",
  "manual-actions.md",
  "remaining-user-decisions.md",
  "audit-run.json"
]);

const LEARNINGS_FILES = new Set([
  "workflow-retrospective-input.json",
  "workflow-retrospective.json",
  "workflow-retrospective.md",
  "workflow-completion.json",
  "audit-run.json"
]);

const ALWAYS_EXCLUDED_TOP_LEVEL = new Set(["exports"]);

export async function runExport(options: AuditExportOptions): Promise<AuditExportSummary> {
  const profile = normalizeProfile(options.profile ?? "review");
  const format = normalizeFormat(options.format ?? "zip");
  const reportDir = options.reportDir;
  const scan = await readOptionalJson<ScanResult>(join(reportDir, "scan-result.json"));
  const siteSlug = scan
    ? scan.config.auditSlug || auditSlugForTarget(scan.config.url, scan.config.auditName)
    : basename(reportDir) || "site-audit";
  const generatedAt = new Date().toISOString();
  const exportBaseName = `seo-polish-${siteSlug}-${auditTimestamp(new Date(generatedAt))}-${profile}`;
  const outputPath =
    options.outputPath ??
    join(reportDir, "exports", format === "zip" ? `${exportBaseName}.zip` : exportBaseName);
  const localPathsRedacted = options.includePrivatePaths !== true;
  const siteIdentityRedacted = profile === "learnings" && localPathsRedacted;
  const selectedFiles = await selectReportFiles(reportDir, profile);
  const entries = await buildExportEntries(reportDir, selectedFiles, {
    redactLocalPaths: localPathsRedacted,
    redactSiteIdentity: siteIdentityRedacted
  });
  const manifest = buildExportManifest({
    reportDir,
    generatedAt,
    profile,
    format,
    outputPath,
    scan,
    entries,
    localPathsRedacted,
    siteIdentityRedacted
  });
  entries.push({
    path: "LICENSE-NOTICE.md",
    content: Buffer.from(renderLicenseNotice(), "utf8")
  });
  entries.push({
    path: "export-manifest.json",
    content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  });
  const checksums = renderChecksums(entries);
  entries.push({ path: "checksums.sha256", content: Buffer.from(checksums, "utf8") });

  await assertWritableOutput(outputPath, options.overwrite === true);
  if (format === "directory") {
    await writeDirectoryExport(outputPath, entries);
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buildZip(entries));
  }

  return {
    reportDir,
    profile,
    format,
    outputPath,
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.content.byteLength, 0),
    manifestPath: format === "directory" ? join(outputPath, "export-manifest.json") : "export-manifest.json",
    checksumsPath: format === "directory" ? join(outputPath, "checksums.sha256") : "checksums.sha256",
    localPathsRedacted
  };
}

function normalizeProfile(profile: AuditExportProfile): AuditExportProfile {
  if (["review", "full", "repo-import", "learnings"].includes(profile)) {
    return profile;
  }
  throw new Error(`Unsupported export profile: ${profile}`);
}

function normalizeFormat(format: AuditExportFormat): AuditExportFormat {
  if (["zip", "directory"].includes(format)) {
    return format;
  }
  throw new Error(`Unsupported export format: ${format}`);
}

async function selectReportFiles(reportDir: string, profile: AuditExportProfile): Promise<string[]> {
  const allFiles = await listFiles(reportDir);
  if (profile === "full") {
    return allFiles;
  }
  if (profile === "learnings") {
    return allFiles.filter((path) => LEARNINGS_FILES.has(path) || path.startsWith("workflow-learnings/"));
  }
  const include = profile === "review" ? REVIEW_FILES : REPO_IMPORT_FILES;
  return allFiles.filter((path) => include.has(path) || path.startsWith("agent-instructions/"));
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const relativePath = normalizeArchivePath(relative(root, absolute));
    const topLevel = relativePath.split("/")[0];
    if (topLevel && ALWAYS_EXCLUDED_TOP_LEVEL.has(topLevel)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function buildExportEntries(
  reportDir: string,
  files: string[],
  redaction: { redactLocalPaths: boolean; redactSiteIdentity: boolean }
): Promise<ExportEntry[]> {
  const entries: ExportEntry[] = [];
  for (const path of files) {
    const content = await readFile(join(reportDir, path));
    const shouldSanitize = isLikelyText(path, content);
    const sanitized = shouldSanitize ? sanitizeExportContent(content, redaction) : content;
    entries.push({
      path,
      content: sanitized
    });
  }
  return entries;
}

function buildExportManifest(input: {
  reportDir: string;
  generatedAt: string;
  profile: AuditExportProfile;
  format: AuditExportFormat;
  outputPath: string;
  scan: ScanResult | null;
  entries: ExportEntry[];
  localPathsRedacted: boolean;
  siteIdentityRedacted: boolean;
}): unknown {
  const files: ExportManifestFile[] = input.entries.map((entry) => ({
    path: entry.path,
    bytes: entry.content.byteLength,
    sha256: sha256(entry.content)
  }));
  return {
    version: "2026-07-07.audit-export",
    generatedAt: input.generatedAt,
    profile: input.profile,
    format: input.format,
    targetUrl: input.siteIdentityRedacted ? "[redacted-url]" : (input.scan?.config.url ?? null),
    scanId: input.scan?.scanId ?? null,
    auditSlug: input.siteIdentityRedacted ? "[redacted-site]" : (input.scan?.config.auditSlug ?? null),
    auditRunId: input.siteIdentityRedacted ? "[redacted-run]" : (input.scan?.config.auditRunId ?? null),
    sourceReportDir: input.localPathsRedacted ? "[redacted-local-path]" : input.reportDir,
    outputPath: input.localPathsRedacted ? "[redacted-local-path]" : input.outputPath,
    files,
    privacy: {
      localPathsRedacted: input.localPathsRedacted,
      siteIdentityRedacted: input.siteIdentityRedacted,
      cloudUploadIncluded: false,
      cloudUploadNote:
        "Cloud upload is intentionally outside this export. Upload this package only through an explicitly authorized agent connector or storage workflow."
    },
    license: {
      noticeFile: "LICENSE-NOTICE.md",
      summary: "SEO Polish is distributed under the Apache License, Version 2.0."
    }
  };
}

function renderChecksums(entries: ExportEntry[]): string {
  return `${entries
    .map((entry) => `${sha256(entry.content)}  ${entry.path}`)
    .sort()
    .join("\n")}\n`;
}

function renderLicenseNotice(): string {
  return `# License Notice

SEO Polish is licensed under the Apache License, Version 2.0 (the "License").
You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0.

Unless required by applicable law or agreed to in writing, software distributed under the
License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
either express or implied. See the License for the specific language governing permissions
and limitations under the License.
`;
}

async function assertWritableOutput(outputPath: string, overwrite: boolean): Promise<void> {
  if (overwrite) {
    return;
  }
  try {
    await stat(outputPath);
    throw new Error(`Export output already exists: ${outputPath}. Use --overwrite to replace it.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Export output already exists:")) {
      throw error;
    }
  }
}

async function writeDirectoryExport(outputPath: string, entries: ExportEntry[]): Promise<void> {
  for (const entry of entries) {
    const absolute = join(outputPath, entry.path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, entry.content);
  }
}

function sanitizeExportContent(
  content: Buffer,
  redaction: { redactLocalPaths: boolean; redactSiteIdentity: boolean }
): Buffer {
  let sanitized = content.toString("utf8");
  if (redaction.redactLocalPaths) {
    sanitized = sanitizeLocalPaths(sanitized);
  }
  if (redaction.redactSiteIdentity) {
    sanitized = sanitized.replace(/https?:\/\/[^\s"')<>,]+/g, "[redacted-url]");
  }
  return Buffer.from(sanitized, "utf8");
}

function sanitizeLocalPaths(content: string): string {
  return content
    .replace(/\/Users\/[A-Za-z0-9._-]+\/[^\s"')<>,]+/g, "[redacted-local-path]")
    .replace(/\/home\/[A-Za-z0-9._-]+\/[^\s"')<>,]+/g, "[redacted-local-path]")
    .replace(/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\[^\s"')<>,]+/g, "[redacted-local-path]");
}

function isLikelyText(path: string, content: Buffer): boolean {
  if (content.includes(0)) return false;
  return /\.(csv|css|html|json|jsonl|md|svg|txt|xml|ya?ml|diff)$/i.test(path);
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildZip(entries: ExportEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const filename = Buffer.from(normalizeArchivePath(entry.path), "utf8");
    const crc = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.content.byteLength, 18);
    localHeader.writeUInt32LE(entry.content.byteLength, 22);
    localHeader.writeUInt16LE(filename.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, filename, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.content.byteLength, 20);
    centralHeader.writeUInt32LE(entry.content.byteLength, 24);
    centralHeader.writeUInt16LE(filename.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, filename);
    offset += localHeader.byteLength + filename.byteLength + entry.content.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localFiles.byteLength, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localFiles, centralDirectory, end]);
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  })
);

function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Finding, RemediationPlan, ScanResult } from "@seo-polish/schemas";

export type AdapterId =
  "nextjs" | "astro" | "nuxt" | "sveltekit" | "remix" | "docusaurus" | "static-html" | "generic";
export type ChangeOperation = "create" | "update";
export type ChangeSetStatus = "planned" | "partially_applied" | "applied" | "failed";

export interface PlannedChange {
  id: string;
  findingId: string;
  path: string;
  operation: ChangeOperation;
  reason: string;
  content: string;
  originalHash: string | null;
  contentHash: string;
  approvalRequired: boolean;
  sensitiveArea: string | null;
  validation: string[];
}

export interface ChangeSet {
  version: "1";
  id: string;
  generatedAt: string;
  reportDir: string;
  repoPath: string;
  adapter: AdapterId;
  status: ChangeSetStatus;
  changes: PlannedChange[];
  skippedFindings: Array<{ findingId: string; reason: string }>;
  appliedChangeIds: string[];
  skippedChangeIds: string[];
  failedChanges: Array<{ changeId: string; reason: string }>;
  safety: {
    confinedToRepo: true;
    existingFilesRequireHashMatch: true;
    sensitiveChangesRequireApproval: true;
  };
}

export interface PlanChangeSetOptions {
  reportDir: string;
  repoPath: string;
  adapter?: AdapterId;
}

export interface ApplyChangeSetOptions {
  changeSet: ChangeSet;
  approvedChangeIds?: string[];
  skipUnapproved?: boolean;
}

export async function detectAdapter(repoPathInput: string): Promise<AdapterId> {
  const repoPath = resolve(repoPathInput);
  const packageJson = await readOptionalJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(join(repoPath, "package.json"));
  const dependencies = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);
  if (
    dependencies.has("next") ||
    (await anyExists(repoPath, ["next.config.js", "next.config.mjs", "next.config.ts"]))
  ) {
    return "nextjs";
  }
  if (dependencies.has("astro") || (await anyExists(repoPath, ["astro.config.mjs", "astro.config.ts"])))
    return "astro";
  if (dependencies.has("nuxt") || (await anyExists(repoPath, ["nuxt.config.ts", "nuxt.config.js"])))
    return "nuxt";
  if (dependencies.has("@sveltejs/kit") || (await exists(join(repoPath, "svelte.config.js"))))
    return "sveltekit";
  if (dependencies.has("@remix-run/node") || dependencies.has("@remix-run/react")) return "remix";
  if (dependencies.has("@docusaurus/core")) return "docusaurus";
  if (await exists(join(repoPath, "index.html"))) return "static-html";
  return "generic";
}

export async function planChangeSet(options: PlanChangeSetOptions): Promise<ChangeSet> {
  const reportDir = resolve(options.reportDir);
  const repoPath = resolve(options.repoPath);
  const adapter = options.adapter ?? (await detectAdapter(repoPath));
  const [scan, findings, plan] = await Promise.all([
    readJson<ScanResult>(join(reportDir, "scan-result.json")),
    readJson<Finding[]>(join(reportDir, "findings.json")),
    readJson<RemediationPlan>(join(reportDir, "remediation-plan.json"))
  ]);
  const safeFindingIds = new Set(plan.safeFixes.map((item) => item.findingId));
  const changes: PlannedChange[] = [];
  const skippedFindings: ChangeSet["skippedFindings"] = [];
  const add = async (
    findingId: string,
    path: string,
    content: string,
    reason: string,
    approvalRequired: boolean,
    sensitiveArea: string | null,
    validation: string[]
  ): Promise<void> => {
    const absolute = confinedPath(repoPath, path);
    const original = await readOptionalText(absolute);
    if (original !== null && original === content) {
      skippedFindings.push({ findingId, reason: `${path} already contains the proposed content.` });
      return;
    }
    changes.push({
      id: `change_${slug(`${findingId}-${path}`)}_${randomUUID().slice(0, 6)}`,
      findingId,
      path,
      operation: original === null ? "create" : "update",
      reason,
      content,
      originalHash: original === null ? null : hash(original),
      contentHash: hash(content),
      approvalRequired,
      sensitiveArea,
      validation
    });
  };

  const origin = new URL(scan.config.url).origin;
  const publicRoot = publicRootFor(adapter);
  for (const finding of uniqueFindings(findings)) {
    if (!safeFindingIds.has(finding.id)) {
      skippedFindings.push({
        findingId: finding.id,
        reason: "Finding is not classified as a safe change candidate."
      });
      continue;
    }
    if (finding.id === "SEO-CRAWL-001" || finding.id === "SEO-CRAWL-004") {
      await add(
        finding.id,
        join(publicRoot, "robots.txt"),
        robotsContent(origin),
        "Publish a bounded crawler-policy proposal with sitemap discovery.",
        true,
        "crawler_policy",
        [`curl -fsS ${origin}/robots.txt`, "seo-polish scan <url>"]
      );
      continue;
    }
    if (finding.id === "AR-LLMS-001") {
      await add(
        finding.id,
        join(publicRoot, "llms.txt"),
        llmsContent(origin),
        "Publish a public agent discovery proposal derived only from known canonical endpoints.",
        true,
        "public_agent_capability",
        [`curl -fsS ${origin}/llms.txt`, "seo-polish scan <url>"]
      );
      continue;
    }
    if (finding.id === "AR-SKILL-001") {
      await add(
        finding.id,
        join(publicRoot, ".well-known", "agent-skills", "index.json"),
        `${JSON.stringify(agentSkillsContent(origin), null, 2)}\n`,
        "Publish an explicit public agent-skill discovery index.",
        true,
        "public_agent_capability",
        [`curl -fsS ${origin}/.well-known/agent-skills/index.json`]
      );
      continue;
    }
    if (finding.id === "SEO-ONPAGE-011" && adapter === "static-html") {
      const indexPath = join(repoPath, "index.html");
      const html = await readOptionalText(indexPath);
      if (html && !/<meta\s+name=["']viewport["']/i.test(html) && /<head[^>]*>/i.test(html)) {
        await add(
          finding.id,
          "index.html",
          html.replace(
            /<head([^>]*)>/i,
            '<head$1>\n    <meta name="viewport" content="width=device-width, initial-scale=1">'
          ),
          "Add the standard responsive viewport declaration to the static document head.",
          false,
          null,
          ["Open the page at mobile and desktop widths.", "seo-polish scan <url>"]
        );
      } else {
        skippedFindings.push({
          findingId: finding.id,
          reason: "No safely editable static document head was found."
        });
      }
      continue;
    }
    skippedFindings.push({
      findingId: finding.id,
      reason: `No bounded ${adapter} adapter operation is implemented for this finding.`
    });
  }

  const changeSet: ChangeSet = {
    version: "1",
    id: `changeset_${randomUUID().slice(0, 12)}`,
    generatedAt: new Date().toISOString(),
    reportDir,
    repoPath,
    adapter,
    status: "planned",
    changes,
    skippedFindings,
    appliedChangeIds: [],
    skippedChangeIds: [],
    failedChanges: [],
    safety: {
      confinedToRepo: true,
      existingFilesRequireHashMatch: true,
      sensitiveChangesRequireApproval: true
    }
  };
  await writeJson(join(reportDir, "change-set.json"), changeSet);
  await writeFile(join(reportDir, "change-set.diff"), renderChangeSetDiff(changeSet), "utf8");
  return changeSet;
}

export async function applyChangeSet(options: ApplyChangeSetOptions): Promise<ChangeSet> {
  const changeSet = structuredClone(options.changeSet);
  const approved = new Set(options.approvedChangeIds ?? []);
  changeSet.appliedChangeIds = [];
  changeSet.skippedChangeIds = [];
  changeSet.failedChanges = [];

  for (const change of changeSet.changes) {
    if (change.approvalRequired && !approved.has(change.id)) {
      if (options.skipUnapproved) {
        changeSet.skippedChangeIds.push(change.id);
        continue;
      }
      changeSet.failedChanges.push({ changeId: change.id, reason: "Explicit approval is required." });
      continue;
    }
    try {
      const target = confinedPath(changeSet.repoPath, change.path);
      await assertNoSymlinkParents(changeSet.repoPath, target);
      const existing = await readOptionalText(target);
      if (change.operation === "create" && existing !== null) {
        throw new Error("The target now exists; refusing to overwrite a planned create operation.");
      }
      if (change.operation === "update") {
        if (existing === null) throw new Error("The target was removed after planning.");
        if (!change.originalHash || hash(existing) !== change.originalHash) {
          throw new Error("The target changed after planning; hash verification failed.");
        }
      }
      if (hash(change.content) !== change.contentHash) throw new Error("Planned content hash is invalid.");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, change.content, {
        encoding: "utf8",
        flag: change.operation === "create" ? "wx" : "w"
      });
      changeSet.appliedChangeIds.push(change.id);
    } catch (error) {
      changeSet.failedChanges.push({ changeId: change.id, reason: errorMessage(error) });
    }
  }

  changeSet.status =
    changeSet.failedChanges.length === 0
      ? "applied"
      : changeSet.appliedChangeIds.length > 0
        ? "partially_applied"
        : "failed";
  await writeJson(join(changeSet.reportDir, "change-set.json"), changeSet);
  return changeSet;
}

export function renderChangeSetDiff(changeSet: ChangeSet): string {
  if (changeSet.changes.length === 0) return "# No bounded framework-adapter changes are available.\n";
  return changeSet.changes
    .map((change) => {
      const lines = change.content.split("\n");
      const header =
        change.operation === "create"
          ? `diff --git a/${change.path} b/${change.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${change.path}`
          : `diff --git a/${change.path} b/${change.path}\n--- a/${change.path}\n+++ b/${change.path}`;
      return `${header}\n@@ proposed @@\n${lines.map((line) => `+${line}`).join("\n")}\n`;
    })
    .join("\n");
}

function publicRootFor(adapter: AdapterId): string {
  if (["nextjs", "astro", "sveltekit", "remix", "docusaurus", "generic"].includes(adapter)) return "public";
  if (adapter === "nuxt") return "public";
  return ".";
}

function robotsContent(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nDisallow: /login\nDisallow: /logout\nDisallow: /checkout/\nDisallow: /cart/\nDisallow: /payment/\nDisallow: /preview/\nDisallow: /api/internal/\nSitemap: ${origin}/sitemap.xml\n`;
}

function llmsContent(origin: string): string {
  const host = new URL(origin).hostname;
  return `# ${host}\n> Canonical public website entry point for AI agents.\n\n## Primary pages\n- [Home](${origin}/)\n\n## Discovery\n- [Sitemap](${origin}/sitemap.xml)\n- [Crawler policy](${origin}/robots.txt)\n\nPrivate, authenticated, checkout and internal API paths are excluded.\n`;
}

function agentSkillsContent(origin: string): unknown {
  return {
    skills: [
      {
        name: `use-${new URL(origin).hostname.replace(/[^a-z0-9]+/gi, "-")}`,
        type: "skill-md",
        description: "Discover canonical public content without accessing private areas.",
        url: "/.well-known/agent-skills/use-site/SKILL.md"
      }
    ]
  };
}

function uniqueFindings(findings: Finding[]): Finding[] {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

function confinedPath(repoPathInput: string, relativePath: string): string {
  const repoPath = resolve(repoPathInput);
  const target = resolve(repoPath, relativePath);
  if (target !== repoPath && !target.startsWith(`${repoPath}${sep}`)) {
    throw new Error(`Change path escapes repository root: ${relativePath}`);
  }
  return target;
}

async function assertNoSymlinkParents(repoPathInput: string, target: string): Promise<void> {
  const repoPath = resolve(repoPathInput);
  const segments = relative(repoPath, dirname(target)).split(sep).filter(Boolean);
  let current = repoPath;
  for (const segment of segments) {
    current = join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (info?.isSymbolicLink()) throw new Error(`Refusing to write through symlinked directory: ${current}`);
  }
}

async function anyExists(root: string, paths: string[]): Promise<boolean> {
  for (const path of paths) if (await exists(join(root, path))) return true;
  return false;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

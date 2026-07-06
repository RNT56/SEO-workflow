import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RepoAnalysis, RepoSourceFile, ScanConfig } from "@seo-polish/schemas";

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".astro",
  ".turbo",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  ".netlify",
  ".vercel"
]);

const MAX_FILES = 1200;
const MAX_PACKAGE_DEPS = 160;

export async function analyzeRepository(config: Pick<ScanConfig, "repoPath">): Promise<RepoAnalysis> {
  const generatedAt = new Date().toISOString();
  if (!config.repoPath) {
    return emptyAnalysis(generatedAt, "not_configured", ["No --repo path was supplied."]);
  }

  const root = path.resolve(config.repoPath);
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return emptyAnalysis(generatedAt, "error", [`Repo path is not a directory: ${root}`], root);
    }
  } catch (error) {
    return emptyAnalysis(
      generatedAt,
      "error",
      [`Repo path could not be read: ${error instanceof Error ? error.message : String(error)}`],
      root
    );
  }

  const files = await collectFiles(root);
  const packageJson = await readPackageJson(root);
  const dependencies = packageJson ? collectDependencies(packageJson).slice(0, MAX_PACKAGE_DEPS) : [];
  const scripts = packageJson ? Object.keys(asRecord(packageJson["scripts"])).sort() : [];
  const frameworks = detectFrameworks(files, dependencies);
  const packageManager = detectPackageManager(files);
  const sourceFiles = files
    .map((file) => classifyFile(file, frameworks))
    .filter((file): file is RepoSourceFile => Boolean(file));
  const routeFiles = sourceFiles.filter((file) => file.kind === "route");
  const staticFiles = sourceFiles.filter((file) => file.kind === "static_asset");
  const deploymentFiles = sourceFiles.filter((file) => file.kind === "deployment");
  const seoFiles = sourceFiles.filter((file) => ["metadata", "robots", "sitemap"].includes(file.kind));

  const limitations = [
    "Repository analysis records paths and dependency names only; it does not extract source bodies or secrets.",
    "Source mappings are candidates and must be treated by confidence until a repo-aware fixer verifies them."
  ];
  if (files.length >= MAX_FILES) {
    limitations.push(`File walk stopped at ${MAX_FILES} entries.`);
  }

  return {
    generatedAt,
    status: "ok",
    path: root,
    ...(packageManager ? { packageManager } : {}),
    frameworks,
    dependencies,
    scripts,
    sourceFiles,
    routeFiles,
    staticFiles,
    deploymentFiles,
    seoFiles,
    confidence: frameworks.length > 0 || sourceFiles.length > 0 ? 82 : 40,
    limitations
  };
}

function emptyAnalysis(
  generatedAt: string,
  status: RepoAnalysis["status"],
  limitations: string[],
  repoPath?: string
): RepoAnalysis {
  return {
    generatedAt,
    status,
    ...(repoPath ? { path: repoPath } : {}),
    frameworks: [],
    dependencies: [],
    scripts: [],
    sourceFiles: [],
    routeFiles: [],
    staticFiles: [],
    deploymentFiles: [],
    seoFiles: [],
    confidence: 0,
    limitations
  };
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_FILES) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        break;
      }
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      const relative = toPosix(path.relative(root, absolute));
      if (!isIgnoredFile(relative)) {
        files.push(relative);
      }
    }
  }

  await walk(root);
  return files.sort();
}

function isIgnoredFile(file: string): boolean {
  const basename = path.posix.basename(file);
  if (basename.startsWith(".env")) {
    return true;
  }
  if (basename.endsWith(".map")) {
    return true;
  }
  return /\.(pem|key|crt|p12|pfx|sqlite|db)$/i.test(basename);
}

async function readPackageJson(root: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path.join(root, "package.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectDependencies(pkg: Record<string, unknown>): string[] {
  return [
    ...Object.keys(asRecord(pkg["dependencies"])),
    ...Object.keys(asRecord(pkg["devDependencies"])),
    ...Object.keys(asRecord(pkg["peerDependencies"]))
  ].sort();
}

function detectPackageManager(files: string[]): string | undefined {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("package-lock.json")) return "npm";
  return undefined;
}

function detectFrameworks(files: string[], dependencies: string[]): string[] {
  const frameworks = new Set<string>();
  const depSet = new Set(dependencies);
  const hasFile = (pattern: RegExp): boolean => files.some((file) => pattern.test(file));

  if (depSet.has("next") || hasFile(/(^|\/)next\.config\.[cm]?[jt]s$/)) frameworks.add("nextjs");
  if (depSet.has("astro") || hasFile(/(^|\/)astro\.config\.[cm]?[jt]s$/)) frameworks.add("astro");
  if (depSet.has("nuxt") || depSet.has("nuxt3") || hasFile(/(^|\/)nuxt\.config\.[cm]?[jt]s$/)) {
    frameworks.add("nuxt");
  }
  if (depSet.has("@sveltejs/kit") || hasFile(/(^|\/)svelte\.config\.[cm]?[jt]s$/))
    frameworks.add("sveltekit");
  if (
    depSet.has("@remix-run/node") ||
    depSet.has("@remix-run/react") ||
    hasFile(/(^|\/)remix\.config\.[cm]?[jt]s$/)
  ) {
    frameworks.add("remix");
  }
  if (depSet.has("@docusaurus/core") || hasFile(/(^|\/)docusaurus\.config\.[cm]?[jt]s$/)) {
    frameworks.add("docusaurus");
  }
  if (depSet.has("vite") || hasFile(/(^|\/)vite\.config\.[cm]?[jt]s$/)) frameworks.add("vite");
  if (depSet.has("gatsby") || hasFile(/(^|\/)gatsby-config\.[cm]?[jt]s$/)) frameworks.add("gatsby");
  if (depSet.has("react")) frameworks.add("react");
  if (depSet.has("vue")) frameworks.add("vue");

  return [...frameworks];
}

function classifyFile(file: string, frameworks: string[]): RepoSourceFile | null {
  const basename = path.posix.basename(file);
  const lower = file.toLowerCase();
  const frameworkSet = new Set(frameworks);

  if (basename === "package.json") {
    return sourceFile(file, "package", 99, "Package manifest defines scripts and dependencies.");
  }
  if (/^(next|astro|nuxt|svelte|vite|gatsby|docusaurus|remix)\.config\./.test(basename)) {
    return sourceFile(file, "framework_config", 96, "Framework configuration file.");
  }
  if (
    ["vercel.json", "netlify.toml", "wrangler.toml", "firebase.json", "_headers", "_redirects"].includes(
      basename
    )
  ) {
    return sourceFile(file, "deployment", 94, "Deployment or edge routing configuration.");
  }
  if (/(\bpublic\/|^static\/|^assets\/).*\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(file)) {
    return sourceFile(file, "static_asset", 78, "Public static media asset.");
  }
  if (/(^|\/)(robots\.txt|robots\.[cm]?[jt]s|robots\.ts)$/.test(lower)) {
    return sourceFile(file, "robots", 97, "Robots policy source candidate.");
  }
  if (/(^|\/)(sitemap\.xml|sitemap\.[cm]?[jt]s|sitemap\.ts)$/.test(lower)) {
    return sourceFile(file, "sitemap", 97, "Sitemap source candidate.");
  }
  if (/(^|\/)(layout|head|metadata|seo|document)\.[cm]?[jt]sx?$/.test(lower)) {
    return sourceFile(file, "metadata", 88, "Metadata, layout or head source candidate.");
  }
  if (isRouteFile(lower, frameworkSet)) {
    return sourceFile(file, "route", 82, "Route or page source candidate.");
  }
  if (/(\bcontent\/|\bposts\/|\barticles\/|\bpages\/).*\.(md|mdx|json|ya?ml)$/i.test(file)) {
    return sourceFile(file, "content", 72, "Content source candidate.");
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(lower)) {
    return sourceFile(file, "test", 70, "Test file.");
  }
  return null;
}

function isRouteFile(file: string, frameworks: Set<string>): boolean {
  if (frameworks.has("nextjs") && /(^|\/)(app|pages)\/.*\.(page\.)?[cm]?[jt]sx?$/.test(file)) return true;
  if (frameworks.has("sveltekit") && /(^|\/)src\/routes\/.*\+page\.svelte$/.test(file)) return true;
  if (frameworks.has("nuxt") && /(^|\/)pages\/.*\.vue$/.test(file)) return true;
  if (frameworks.has("astro") && /(^|\/)src\/pages\/.*\.(astro|mdx?|[cm]?[jt]sx?)$/.test(file)) return true;
  if (frameworks.has("remix") && /(^|\/)app\/routes\/.*\.[cm]?[jt]sx?$/.test(file)) return true;
  return /(^|\/)(pages|routes)\/.*\.(astro|vue|svelte|mdx?|[cm]?[jt]sx?)$/.test(file);
}

function sourceFile(
  file: string,
  kind: RepoSourceFile["kind"],
  confidence: number,
  reason: string
): RepoSourceFile {
  return { path: file, kind, confidence, reason };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

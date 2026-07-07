#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "seo-polish-report",
  "audit-reports",
  "reports"
]);

const IGNORED_FILES = new Set(["pnpm-lock.yaml"]);

const PATTERNS = [
  ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["OpenAI API key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["Private key header", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["Generic credential assignment", /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{16,}["']/gi]
];

const findings = [];

await scanDir(ROOT);

if (findings.length > 0) {
  console.error("Potential secrets detected:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.label}`);
  }
  process.exitCode = 1;
} else {
  console.log("No secret-looking values detected.");
}

async function scanDir(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await scanDir(path);
      }
      continue;
    }
    if (!entry.isFile() || IGNORED_FILES.has(rel)) {
      continue;
    }
    await scanFile(path, rel);
  }
}

async function scanFile(path, rel) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return;
  }

  for (const [label, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({
        file: rel,
        line: lineForOffset(text, match.index ?? 0),
        label
      });
    }
  }
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

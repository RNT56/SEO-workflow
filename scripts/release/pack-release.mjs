import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const releasePackages = JSON.parse(readFileSync("scripts/release/packages.json", "utf8"));
const outputDir = ".release-tarballs";
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const results = [];
for (const item of releasePackages) {
  const pack = spawnSync("pnpm", ["--filter", item.name, "pack", "--pack-destination", outputDir, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (pack.status !== 0) {
    process.stderr.write(pack.stdout);
    process.stderr.write(pack.stderr);
    process.exit(pack.status ?? 1);
  }
  const packed = JSON.parse(pack.stdout);
  const filename = packed.filename;
  const packageJsonRaw = spawnSync("tar", ["-xOf", filename, "package/package.json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (packageJsonRaw.status !== 0) {
    process.stderr.write(packageJsonRaw.stderr);
    process.exit(packageJsonRaw.status ?? 1);
  }
  const packageJson = JSON.parse(packageJsonRaw.stdout);
  assertNoWorkspaceDependencies(item.name, packageJson.dependencies ?? {});
  assertNoWorkspaceDependencies(item.name, packageJson.peerDependencies ?? {});
  assertNoWorkspaceDependencies(item.name, packageJson.optionalDependencies ?? {});
  if (!packed.files.some((file) => file.path === "LICENSE")) {
    throw new Error(`${item.name} tarball does not include LICENSE.`);
  }
  results.push({
    name: item.name,
    version: packed.version,
    filename: join(outputDir, filename.split("/").pop()),
    files: packed.files.length
  });
}

console.log(JSON.stringify({ ok: true, packages: results }, null, 2));

function assertNoWorkspaceDependencies(packageName, dependencies) {
  for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
    if (String(dependencyVersion).startsWith("workspace:")) {
      throw new Error(`${packageName} packed with unresolved workspace dependency ${dependencyName}.`);
    }
  }
}

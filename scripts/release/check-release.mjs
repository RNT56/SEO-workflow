import { access, readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const rootPackage = await readJson("package.json");
const releasePackages = await readJson("scripts/release/packages.json");
const releaseNames = new Set(releasePackages.map((item) => item.name));
const failures = [];

if (!rootPackage.private) {
  failures.push("Root package must remain private.");
}

for (const item of releasePackages) {
  const packagePath = join(item.path, "package.json");
  const packageJson = await readJson(packagePath);
  if (packageJson.name !== item.name) {
    failures.push(`${packagePath} name mismatch: expected ${item.name}, found ${packageJson.name}`);
  }
  if (packageJson.version !== rootPackage.version) {
    failures.push(`${item.name} version ${packageJson.version} does not match root ${rootPackage.version}`);
  }
  if (packageJson.private) {
    failures.push(`${item.name} is marked private but is listed for release.`);
  }
  if (packageJson.license !== "Apache-2.0") {
    failures.push(`${item.name} must use the Apache-2.0 SPDX license identifier.`);
  }
  if (packageJson.publishConfig?.access !== "public") {
    failures.push(`${item.name} must declare publishConfig.access=public.`);
  }
  await mustExist(join(item.path, "README.md"), failures);
  await mustExist(join(item.path, "LICENSE"), failures);

  const dependencyBlocks = ["dependencies", "peerDependencies", "optionalDependencies"];
  for (const block of dependencyBlocks) {
    for (const [dependencyName, dependencyVersion] of Object.entries(packageJson[block] ?? {})) {
      if (dependencyName === "@seo-polish/sdk") {
        failures.push(`${item.name} must not depend on @seo-polish/sdk.`);
      }
      if (String(dependencyVersion).startsWith("workspace:") && !releaseNames.has(dependencyName)) {
        failures.push(`${item.name} has workspace dependency ${dependencyName} outside release set.`);
      }
    }
  }
}

for (const packageDir of readdirSync("packages")) {
  const packagePath = join("packages", packageDir, "package.json");
  if (!existsSync(packagePath)) {
    continue;
  }
  const packageJson = await readJson(packagePath);
  if (packageJson.name === "@seo-polish/sdk") {
    if (!packageJson.private) {
      failures.push("@seo-polish/sdk must stay private for this release.");
    }
    if (releaseNames.has(packageJson.name)) {
      failures.push("@seo-polish/sdk must not be listed in scripts/release/packages.json.");
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`release check failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      version: rootPackage.version,
      publishablePackages: releasePackages.length,
      sdkPublished: false
    },
    null,
    2
  )
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function mustExist(path, failures) {
  try {
    await access(path);
  } catch {
    failures.push(`${path} is required for release.`);
  }
}

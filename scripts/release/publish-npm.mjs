import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const releasePackages = JSON.parse(readFileSync("scripts/release/packages.json", "utf8"));
const published = [];
const skipped = [];

for (const item of releasePackages) {
  const packageJson = JSON.parse(readFileSync(join(item.path, "package.json"), "utf8"));
  if (isAlreadyPublished(item.name, packageJson.version)) {
    console.log(`${item.name}@${packageJson.version} already exists on npm; skipping.`);
    skipped.push(item.name);
    continue;
  }
  const publish = spawnSync(
    "pnpm",
    ["--filter", item.name, "publish", "--access", "public", "--no-git-checks"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  process.stdout.write(publish.stdout);
  process.stderr.write(publish.stderr);
  if (publish.status !== 0) {
    console.error(
      `Failed to publish ${item.name}. Published before failure: ${published.join(", ") || "none"}`
    );
    process.exit(publish.status ?? 1);
  }
  published.push(item.name);
}

console.log(JSON.stringify({ ok: true, published, skipped }, null, 2));

function isAlreadyPublished(name, version) {
  const view = spawnSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return view.status === 0 && view.stdout.includes(version);
}

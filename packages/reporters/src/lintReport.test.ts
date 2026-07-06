import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_SECTIONS, sectionHeading } from "@seo-polish/schemas";
import { lintReport } from "./lintReport.js";

describe("report linter", () => {
  it("fails missing required files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seo-polish-lint-"));
    await writeFile(join(dir, "index.md"), REPORT_SECTIONS.map(sectionHeading).join("\n"), "utf8");
    const result = await lintReport(dir, { strict: true });
    expect(result.ok).toBe(false);
  });
});

import type { Finding, RemediationPlan, ScanConfig } from "@seo-polish/schemas";

export interface PatchBundle {
  patchDiff: string;
  patchPlanMarkdown: string;
  changedFiles: Array<{ path: string; reason: string; mode: "create" | "update" }>;
  frameworkActions: Array<{ framework: string; action: string }>;
  manualActions: string[];
}

export function generatePatchBundle(
  config: ScanConfig,
  findings: Finding[],
  plan: RemediationPlan
): PatchBundle {
  const origin = new URL(config.url).origin;
  const safeFindingIds = new Set(plan.safeFixes.map((fix) => fix.findingId));
  const chunks: string[] = [];
  const changedFiles: PatchBundle["changedFiles"] = [];

  if (safeFindingIds.has("SEO-CRAWL-001") || safeFindingIds.has("SEO-CRAWL-004")) {
    changedFiles.push({
      path: "public/robots.txt",
      reason: "Add crawl policy and sitemap directive.",
      mode: "create"
    });
    chunks.push(`diff --git a/public/robots.txt b/public/robots.txt
new file mode 100644
--- /dev/null
+++ b/public/robots.txt
@@ -0,0 +1,12 @@
+User-agent: *
+Allow: /
+Disallow: /admin/
+Disallow: /account/
+Disallow: /login
+Disallow: /logout
+Disallow: /checkout/
+Disallow: /cart/
+Disallow: /payment/
+Disallow: /api/internal/
+Sitemap: ${origin}/sitemap.xml
+# AI policy fields require explicit owner approval.
`);
  }

  if (safeFindingIds.has("AR-LLMS-001")) {
    changedFiles.push({
      path: "public/llms.txt",
      reason: "Add canonical agent entry point.",
      mode: "create"
    });
    chunks.push(`diff --git a/public/llms.txt b/public/llms.txt
new file mode 100644
--- /dev/null
+++ b/public/llms.txt
@@ -0,0 +1,14 @@
+# ${new URL(config.url).hostname}
+> Canonical public website entry point for AI agents.
+
+## Primary pages
+- [Home](${origin}/)
+
+## For AI agents
+- Sitemap: ${origin}/sitemap.xml
+- Policy: ${origin}/robots.txt
+
+## Recommended agent path
+1. Read this file.
+2. Use the sitemap to find canonical public pages.
+3. Do not crawl account, admin, checkout, cart, login, preview or internal API paths.
`);
  }

  const manualActions = findings
    .filter((finding) => !safeFindingIds.has(finding.id))
    .map((finding) => `${finding.id}: ${finding.recommendation}`);

  return {
    patchDiff:
      chunks.length > 0
        ? chunks.join("\n")
        : "# No safe automatic patch could be generated. Review remediation-plan.json for manual and approval-required actions.\n",
    patchPlanMarkdown: renderPatchPlan(plan),
    changedFiles,
    frameworkActions: [
      {
        framework: config.framework ?? "auto",
        action: "Use framework adapter to place public artifacts in the correct static or route directory."
      }
    ],
    manualActions
  };
}

function renderPatchPlan(plan: RemediationPlan): string {
  const lines = ["# SEO Polish Patch Plan", ""];
  for (const phase of plan.phases) {
    lines.push(`## ${phase.title}`, phase.summary, "");
    if (phase.items.length === 0) {
      lines.push("No items.", "");
      continue;
    }
    for (const item of phase.items) {
      lines.push(`- ${item.findingId}: ${item.title}`);
      lines.push(`  - Class: ${item.fixClass}`);
      lines.push(`  - Effort: ${item.effort}`);
      lines.push(`  - Risk: ${item.risk}`);
      lines.push(`  - Validation: ${item.validation.join("; ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

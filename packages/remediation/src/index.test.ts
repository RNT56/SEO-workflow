import { describe, expect, it } from "vitest";
import type { Finding, RemediationOption } from "@seo-polish/schemas";
import { createRemediationPlan } from "./index.js";

describe("createRemediationPlan", () => {
  it("deduplicates repeated remediation options while preserving finding instances", () => {
    const plan = createRemediationPlan([
      makeFinding("https://example.com/"),
      makeFinding("https://example.com/about")
    ]);

    expect(plan.approvalRequired.filter((item) => item.findingId === "SEO-INDEX-004")).toHaveLength(1);
    expect(
      plan.phases.flatMap((phase) => phase.items).filter((item) => item.findingId === "SEO-INDEX-004")
    ).toHaveLength(1);
  });
});

const canonicalFix: RemediationOption = {
  id: "fix-canonical",
  findingId: "SEO-INDEX-004",
  title: "Confirm canonical strategy",
  fixClass: "approval_required",
  effort: "medium",
  risk: "high",
  implementationPath: "Change canonical metadata only after owner approval.",
  validation: ["seo-polish validate --check canonical"]
};

function makeFinding(url: string): Finding {
  return {
    id: "SEO-INDEX-004",
    title: "Canonical URL is not self-referencing",
    category: "indexability",
    severity: "medium",
    confidence: 90,
    status: "open",
    impact: "Search engines may consolidate the wrong URL.",
    rootCause: "Canonical target differs from the crawled URL.",
    evidence: [
      {
        id: `ev-canonical-${url}`,
        type: "html_selector",
        url,
        selector: "link[rel=canonical]",
        timestamp: "2026-07-06T00:00:00.000Z"
      }
    ],
    affectedUrls: [url],
    affectedTemplates: ["root layout"],
    recommendation: "Confirm canonical strategy before changing metadata.",
    remediation: [canonicalFix],
    safeToAutoFix: false,
    approvalRequired: true,
    validation: ["seo-polish validate --check canonical"]
  };
}

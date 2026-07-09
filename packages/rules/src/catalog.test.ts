import { describe, expect, it } from "vitest";
import { getRule, RULE_CATALOG } from "./catalog.js";

describe("rule catalog maturity", () => {
  it("classifies established SEO separately from experimental discovery conventions", () => {
    expect(getRule("SEO-INDEX-003").maturity).toBe("stable");
    expect(getRule("AR-LLMS-001").maturity).toBe("experimental");
    expect(getRule("AR-AUTH-002").maturity).toBe("emerging");
  });

  it("keeps every catalog entry explicitly classified", () => {
    expect(RULE_CATALOG.length).toBeGreaterThan(0);
    expect(RULE_CATALOG.every((rule) => ["stable", "emerging", "experimental"].includes(rule.maturity))).toBe(
      true
    );
  });
});

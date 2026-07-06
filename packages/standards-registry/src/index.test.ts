import { describe, expect, it } from "vitest";
import { RULE_CATALOG } from "@seo-polish/rules";
import { buildStandardsSnapshot, validateStandardsRegistry } from "./index.js";

describe("standards registry", () => {
  it("maps every catalog rule to a known reviewed standard", () => {
    const validation = validateStandardsRegistry();

    expect(validation.ok).toBe(true);
    expect(validation.checks.filter((check) => check.status === "failed")).toEqual([]);
  });

  it("exports rule coverage metadata", () => {
    const snapshot = buildStandardsSnapshot();

    expect(snapshot.catalogRuleCount).toBe(RULE_CATALOG.length);
    expect(snapshot.implementedRuleCount).toBe(RULE_CATALOG.filter((rule) => rule.implemented).length);
    expect(Object.keys(snapshot.ruleMapping)).toHaveLength(RULE_CATALOG.length);
  });
});

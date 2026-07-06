import { createRequire } from "node:module";
import { RULE_CATALOG } from "@seo-polish/rules";

export interface StandardEntry {
  id: string;
  status: "stable" | "emerging" | "deprecated";
  lastReviewed: string;
}

export interface RuleMappingEntry {
  standard: string;
  standardStatus: string;
  ruleVersion: string;
  lastReviewed: string;
}

export interface StandardsRegistrySnapshot {
  generatedAt: string;
  packageName: string;
  standards: StandardEntry[];
  ruleMapping: Record<string, RuleMappingEntry>;
  implementedRuleCount: number;
  catalogRuleCount: number;
}

export interface StandardsRegistryCheck {
  id: string;
  title: string;
  status: "passed" | "failed";
  message: string;
}

export interface StandardsRegistryValidation {
  ok: boolean;
  generatedAt: string;
  checks: StandardsRegistryCheck[];
}

export const registryPackage = "@seo-polish/standards-registry";

const require = createRequire(import.meta.url);
const standardsData = require("../standards.json") as { standards: StandardEntry[] };
const ruleMappingData = require("../rule-mapping.json") as Record<string, RuleMappingEntry>;

export const STANDARDS = standardsData.standards;
export const RULE_MAPPING = ruleMappingData;

export function buildStandardsSnapshot(): StandardsRegistrySnapshot {
  return {
    generatedAt: new Date().toISOString(),
    packageName: registryPackage,
    standards: STANDARDS,
    ruleMapping: RULE_MAPPING,
    implementedRuleCount: RULE_CATALOG.filter((rule) => rule.implemented).length,
    catalogRuleCount: RULE_CATALOG.length
  };
}

export function validateStandardsRegistry(): StandardsRegistryValidation {
  const checks: StandardsRegistryCheck[] = [];
  const standardIds = new Set(STANDARDS.map((standard) => standard.id));
  const standardsById = new Map(STANDARDS.map((standard) => [standard.id, standard]));
  const mappedRuleIds = new Set(Object.keys(RULE_MAPPING));
  const catalogRuleIds = new Set(RULE_CATALOG.map((rule) => rule.id));

  checks.push(
    check(
      "standards.nonempty",
      "Standards registry is populated",
      STANDARDS.length > 0,
      "The standards registry must include at least one standard entry."
    )
  );
  checks.push(
    check(
      "standards.unique",
      "Standards have unique IDs",
      standardIds.size === STANDARDS.length,
      "Each standard entry must have a unique ID."
    )
  );

  for (const standard of STANDARDS) {
    checks.push(
      check(
        `standard.${standard.id}.reviewed`,
        `${standard.id} review date`,
        isIsoDate(standard.lastReviewed),
        "Every standard entry must include an ISO lastReviewed date."
      )
    );
  }

  for (const rule of RULE_CATALOG) {
    const mapping = RULE_MAPPING[rule.id];
    checks.push(
      check(
        `rule.${rule.id}.mapped`,
        `${rule.id} mapped to a standard`,
        Boolean(mapping),
        "Every catalog rule must have a standards registry mapping."
      )
    );

    if (!mapping) {
      continue;
    }

    checks.push(
      check(
        `rule.${rule.id}.standard-known`,
        `${rule.id} standard exists`,
        standardIds.has(mapping.standard),
        "Rule mapping must reference a standard in standards.json."
      )
    );
    checks.push(
      check(
        `rule.${rule.id}.standard-match`,
        `${rule.id} standard matches catalog`,
        mapping.standard === rule.standard,
        "Rule mapping must match the rule catalog standard field."
      )
    );
    checks.push(
      check(
        `rule.${rule.id}.standard-status-match`,
        `${rule.id} standard status matches registry`,
        mapping.standardStatus === standardsById.get(mapping.standard)?.status,
        "Rule mapping standardStatus must match the referenced standard status."
      )
    );
    checks.push(
      check(
        `rule.${rule.id}.version`,
        `${rule.id} rule version`,
        /^\d+\.\d+\.\d+$/.test(mapping.ruleVersion),
        "Rule mapping must include a semantic ruleVersion."
      )
    );
    checks.push(
      check(
        `rule.${rule.id}.reviewed`,
        `${rule.id} review date`,
        isIsoDate(mapping.lastReviewed),
        "Rule mapping must include an ISO lastReviewed date."
      )
    );
  }

  for (const ruleId of mappedRuleIds) {
    checks.push(
      check(
        `mapping.${ruleId}.catalog-rule`,
        `${ruleId} exists in catalog`,
        catalogRuleIds.has(ruleId),
        "Rule mappings must not reference removed catalog rules."
      )
    );
  }

  return {
    ok: checks.every((item) => item.status !== "failed"),
    generatedAt: new Date().toISOString(),
    checks
  };
}

function check(id: string, title: string, ok: boolean, message: string): StandardsRegistryCheck {
  return {
    id,
    title,
    status: ok ? "passed" : "failed",
    message
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

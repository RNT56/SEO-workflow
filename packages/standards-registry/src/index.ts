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

export const registryPackage = "@seo-polish/standards-registry";

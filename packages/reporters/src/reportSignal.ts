import type {
  Finding,
  RemediationOption,
  Severity,
  ValidationCheck,
  ValidationStatus
} from "@seo-polish/schemas";

export interface FindingGroup {
  key: string;
  id: string;
  title: string;
  severity: Finding["severity"];
  category: Finding["category"];
  count: number;
  safeToAutoFix: boolean;
  approvalRequired: boolean;
  affectedUrls: Set<string>;
  affectedTemplates: Set<string>;
  impact: string;
  rootCause: string;
  recommendation: string;
  validation: string[];
  evidenceCount: number;
  owners: Set<string>;
  automationReadiness: Set<string>;
  sourceLocations: Set<string>;
  blockers: Set<string>;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4
};

export const FIX_CLASS_LABEL: Record<RemediationOption["fixClass"], string> = {
  safe_auto_fix: "Safe auto-fix",
  approval_required: "Approval required",
  manual_strategy: "Manual strategy",
  not_applicable: "Not applicable"
};

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );
}

export function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of findings) {
    const key = `${finding.id}|${finding.title}|${finding.severity}|${finding.category}`;
    const group = groups.get(key) ?? {
      key,
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      count: 0,
      safeToAutoFix: false,
      approvalRequired: false,
      affectedUrls: new Set<string>(),
      affectedTemplates: new Set<string>(),
      impact: finding.impact,
      rootCause: finding.rootCause,
      recommendation: finding.recommendation,
      validation: [],
      evidenceCount: 0,
      owners: new Set<string>(),
      automationReadiness: new Set<string>(),
      sourceLocations: new Set<string>(),
      blockers: new Set<string>()
    };

    group.count += 1;
    group.safeToAutoFix ||= finding.safeToAutoFix;
    group.approvalRequired ||= finding.approvalRequired;
    group.evidenceCount += finding.evidence.length;
    for (const url of finding.affectedUrls) group.affectedUrls.add(url);
    for (const template of finding.affectedTemplates) group.affectedTemplates.add(template);
    if (finding.actionability) {
      group.owners.add(finding.actionability.owner);
      group.automationReadiness.add(finding.actionability.automationReadiness);
      finding.actionability.sourceLocations.forEach((location) => group.sourceLocations.add(location));
      finding.actionability.blockers.forEach((blocker) => group.blockers.add(blocker));
    }
    for (const command of finding.validation) {
      if (!group.validation.includes(command)) group.validation.push(command);
    }
    groups.set(key, group);
  }

  return [...groups.values()].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      right.count - left.count ||
      left.id.localeCompare(right.id)
  );
}

export function uniqueRemediationOptions(items: RemediationOption[]): RemediationOption[] {
  const seen = new Set<string>();
  const result: RemediationOption[] = [];
  for (const item of items) {
    const key = remediationOptionKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function findingInstanceCounts(findings: Finding[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.id, (counts.get(finding.id) ?? 0) + 1);
  }
  return counts;
}

export function formatInstanceSuffix(count: number | undefined): string {
  return count && count > 1 ? ` (${count} instances)` : "";
}

export function validationStatusCounts(checks: ValidationCheck[]): Record<ValidationStatus, number> {
  return checks.reduce<Record<ValidationStatus, number>>(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, warning: 0, not_applicable: 0 }
  );
}

export function attentionValidationChecks(checks: ValidationCheck[]): ValidationCheck[] {
  return checks.filter((check) => check.status === "failed" || check.status === "warning");
}

export function formatSet(values: Set<string>): string {
  if (values.size === 0) return "N/A";
  const visible = [...values].slice(0, 8);
  const hidden = values.size - visible.length;
  return hidden > 0 ? `${visible.join(", ")} plus ${hidden} more` : visible.join(", ");
}

function remediationOptionKey(item: RemediationOption): string {
  return `${item.findingId}|${item.title}|${item.fixClass}|${item.implementationPath}`;
}

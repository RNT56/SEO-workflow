import type { Finding, RemediationOption, ScanPolicy } from "@seo-polish/schemas";

const APPROVAL_RULE_TERMS = [
  "ai training",
  "ai input",
  "crawler policy",
  "noindex",
  "index/noindex",
  "canonical strategy",
  "auth",
  "oauth",
  "payment",
  "checkout",
  "mcp mutation",
  "mutating mcp",
  "product price",
  "opening hours",
  "address",
  "phone"
];

export function requiresApprovalForText(text: string): boolean {
  const normalized = text.toLowerCase();
  return APPROVAL_RULE_TERMS.some((term) => normalized.includes(term));
}

export function enforceApprovalForFinding(finding: Finding): Finding {
  const joined = [finding.title, finding.rootCause, finding.recommendation, ...finding.validation].join("\n");
  if (!requiresApprovalForText(joined)) {
    return finding;
  }

  return {
    ...finding,
    safeToAutoFix: false,
    approvalRequired: true,
    remediation: finding.remediation.map((option) => ({
      ...option,
      fixClass: "approval_required",
      approvalReason:
        option.approvalReason ??
        "This change touches policy, auth, payment, MCP mutation, indexability or ambiguous canonical behavior."
    }))
  };
}

export function classifyPolicyDecision(policy: ScanPolicy): RemediationOption[] {
  const options: RemediationOption[] = [];

  if (policy.aiInput === "ask") {
    options.push(policyOption("DECISION-AI-INPUT", "Decide AI input/RAG policy", "aiInput"));
  }

  if (policy.aiTrain === "ask") {
    options.push(policyOption("DECISION-AI-TRAIN", "Decide AI training policy", "aiTrain"));
  }

  if (policy.mcpMutations !== "disabled") {
    options.push(policyOption("DECISION-MCP-MUTATIONS", "Review MCP mutation policy", "mcpMutations"));
  }

  if (policy.commerceActions !== "disabled") {
    options.push(
      policyOption("DECISION-COMMERCE-ACTIONS", "Review commerce action policy", "commerceActions")
    );
  }

  return options;
}

function policyOption(id: string, title: string, policyField: string): RemediationOption {
  return {
    id,
    findingId: "policy",
    title,
    fixClass: "approval_required",
    effort: "small",
    risk: "high",
    implementationPath: `Confirm the desired ${policyField} value before publishing policy metadata.`,
    validation: ["Review generated robots.txt, llms.txt and public policy artifacts before publishing."],
    approvalReason: "The workflow must not decide website owner policy values."
  };
}

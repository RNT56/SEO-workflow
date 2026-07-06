import type {
  Finding,
  RemediationOption,
  RemediationPhase,
  RemediationPlan,
  Severity,
  UserDecision
} from "@seo-polish/schemas";
import { classifyPolicyDecision } from "@seo-polish/security";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4
};

export function createRemediationPlan(findings: Finding[]): RemediationPlan {
  const options = findings.flatMap((finding) => finding.remediation);
  const sorted = [...options].sort((left, right) => {
    const leftFinding = findings.find((finding) => finding.id === left.findingId);
    const rightFinding = findings.find((finding) => finding.id === right.findingId);
    const leftSeverity = leftFinding?.severity ?? "info";
    const rightSeverity = rightFinding?.severity ?? "info";
    return (
      SEVERITY_ORDER[leftSeverity] - SEVERITY_ORDER[rightSeverity] ||
      effortWeight(left.effort) - effortWeight(right.effort)
    );
  });

  const safeFixes = sorted.filter((option) => option.fixClass === "safe_auto_fix");
  const approvalRequired = sorted.filter((option) => option.fixClass === "approval_required");
  const manualRecommendations = sorted.filter((option) => option.fixClass === "manual_strategy");

  const phases: RemediationPhase[] = [
    phase(
      "do_now_seo",
      "Do now - SEO blockers",
      "Fix critical and high-severity SEO blockers first.",
      sorted.filter(
        (option) =>
          isFindingIn(findings, option.findingId, ["critical", "high"]) &&
          !isAgentFinding(findings, option.findingId)
      )
    ),
    phase(
      "do_now_agent",
      "Do now - Agent blockers",
      "Fix critical and high-severity agent-readiness blockers.",
      sorted.filter(
        (option) =>
          isFindingIn(findings, option.findingId, ["critical", "high"]) &&
          isAgentFinding(findings, option.findingId)
      )
    ),
    phase(
      "do_next_seo",
      "Do next - SEO growth",
      "Improve medium-priority SEO and content quality signals.",
      sorted.filter(
        (option) =>
          isFindingIn(findings, option.findingId, ["medium"]) && !isAgentFinding(findings, option.findingId)
      )
    ),
    phase(
      "do_next_agent",
      "Do next - Agent growth",
      "Improve agent-readable discovery and protocol coverage.",
      sorted.filter(
        (option) =>
          isFindingIn(findings, option.findingId, ["medium", "low"]) &&
          isAgentFinding(findings, option.findingId)
      )
    ),
    phase(
      "later",
      "Later",
      "Info-level or strategic items that should not block the first remediation pass.",
      sorted.filter(
        (option) =>
          isFindingIn(findings, option.findingId, ["low", "info"]) &&
          !isAgentFinding(findings, option.findingId)
      )
    )
  ];

  const userDecisions: UserDecision[] = [
    decision(
      "ai-input-policy",
      "Decide AI input policy",
      "The workflow must not choose whether website content may be used as AI input/RAG context."
    ),
    decision(
      "ai-training-policy",
      "Decide AI training policy",
      "The workflow must not choose whether website content may be used for AI training."
    ),
    decision(
      "mcp-publication",
      "Decide whether MCP read-only tools should be published",
      "MCP metadata changes affect public agent capabilities."
    ),
    decision(
      "authenticated-agent-access",
      "Decide whether authenticated agent access should be supported",
      "Auth flows and scopes require owner approval."
    ),
    decision(
      "indexnow",
      "Decide whether IndexNow should be enabled",
      "Search integration behavior depends on owner and platform preference."
    )
  ];

  return {
    phases,
    safeFixes,
    approvalRequired: [...approvalRequired, ...classifyPolicyDecision(defaultPolicyFromFindings())],
    manualRecommendations,
    userDecisions
  };
}

function phase(id: string, title: string, summary: string, items: RemediationOption[]): RemediationPhase {
  return { id, title, summary, items };
}

function decision(id: string, title: string, reason: string): UserDecision {
  return {
    id,
    title,
    reason,
    options: ["yes", "no", "ask-later"],
    default: "ask-later"
  };
}

function isFindingIn(findings: Finding[], findingId: string, severities: Severity[]): boolean {
  const finding = findings.find((item) => item.id === findingId);
  return finding ? severities.includes(finding.severity) : false;
}

function isAgentFinding(findings: Finding[], findingId: string): boolean {
  const finding = findings.find((item) => item.id === findingId);
  return finding
    ? ["agent_readiness", "protocol_discovery", "api_auth_mcp", "policy"].includes(finding.category)
    : false;
}

function effortWeight(effort: RemediationOption["effort"]): number {
  if (effort === "small") return 0;
  if (effort === "medium") return 1;
  return 2;
}

function defaultPolicyFromFindings() {
  return {
    search: "yes" as const,
    aiInput: "ask" as const,
    aiTrain: "ask" as const,
    mcpMutations: "disabled" as const,
    commerceActions: "disabled" as const
  };
}

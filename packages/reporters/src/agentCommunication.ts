export function renderAgentCommunicationContract(): string {
  return [
    "## Agent Communication Contract",
    "",
    "Run quietly by default. Put detailed evidence, logs, plans and reasoning into the report artifacts, not into chat.",
    "",
    "User-facing updates are appropriate only when:",
    "",
    "- explicit owner approval is required",
    "- a blocker prevents progress",
    "- a security, privacy or safety boundary is reached",
    "- a long-running step exceeds the expected duration",
    "- a validation gate fails",
    "- the workflow is complete",
    "",
    "Do not narrate routine commands, file reads, scans, rerenders, lint passes, obvious next steps or raw command output unless the user explicitly asks for that detail.",
    "",
    "When the host agent runtime requires progress updates, keep them terse and state only material status changes. This workflow contract does not override higher-priority runtime or safety instructions.",
    "",
    "Final responses should include only:",
    "",
    "- report path",
    "- final score and readiness status",
    "- top three to five actions",
    "- validation gates passed or failed",
    "- remaining approval decisions, blockers or measurement limitations"
  ].join("\n");
}

export function renderAgentCommunicationPromptClause(): string {
  return [
    "Run quietly by default.",
    "Do not narrate routine commands, file reads, scans, rerenders, lint passes or obvious next steps.",
    "Send user-facing updates only for approvals, blockers, safety boundaries, long-running delays, failed gates and final completion.",
    "Put detailed evidence, logs, plans and reasoning into report artifacts.",
    "Keep the final response concise: report path, final score/readiness, top actions, gates, remaining approvals and limitations."
  ].join(" ");
}

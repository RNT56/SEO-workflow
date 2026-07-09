import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { applyChangeSet, planChangeSet, type ChangeSet } from "@seo-polish/adapters";
import { runReportRender, runScan, runValidate } from "@seo-polish/core";
import type {
  AgentReview,
  RemediationPlan,
  Score,
  VerificationManifest,
  WorkflowDecision,
  WorkflowEvent,
  WorkflowMode,
  WorkflowPhase,
  WorkflowPhaseId,
  WorkflowProject,
  WorkflowRetrospective,
  WorkflowState,
  WorkflowTarget
} from "@seo-polish/schemas";

export const WORKSPACE_FILE = "seo-polish.workspace.json";
export const WORKFLOW_STATE_FILE = "workflow-state.json";
export const WORKFLOW_EVENTS_FILE = "workflow-events.jsonl";
export const DECISIONS_FILE = "decisions.json";
export const VERIFICATION_FILE = "verification-manifest.json";
export const PROJECT_SNAPSHOT_FILE = "workflow-project.json";

const PHASE_IDS: WorkflowPhaseId[] = [
  "preflight",
  "scan",
  "evidence_gate",
  "review",
  "decisions",
  "plan",
  "apply",
  "verify",
  "retrospective",
  "complete"
];

export interface InitProjectOptions {
  workspacePath?: string;
  name?: string;
  url: string;
  targetName?: string;
  repoPath?: string;
  auditRoot?: string;
  auditName?: string;
  mode?: WorkflowMode;
  overwrite?: boolean;
}

export interface RunWorkflowOptions {
  workspacePath?: string;
  targetId?: string;
  mode?: WorkflowMode;
  baselinePath?: string;
  browserEvidence?: boolean;
  coreWebVitals?: boolean;
  maxPages?: number;
  applySafe?: boolean;
  verificationUrl?: string;
}

export interface ResumeWorkflowOptions {
  statePath: string;
  applySafe?: boolean;
  runProjectChecks?: boolean;
  verificationUrl?: string;
}

export interface DecisionInput {
  statePath: string;
  decisionId: string;
  status: Exclude<WorkflowDecision["status"], "pending">;
  selectedOption?: string;
  note?: string;
  decidedBy?: string;
}

export interface WorkflowComparison {
  version: "1";
  generatedAt: string;
  baselineReport: string;
  currentReport: string;
  scoreDelta: number;
  experimentalScoreDelta: number;
  coverageDelta: number;
  newFindingGroups: string[];
  resolvedFindingGroups: string[];
  recurringFindingGroups: string[];
  newCriticalHigh: string[];
  verdict: "improved" | "unchanged" | "regressed";
  regressionGate: "passed" | "failed";
}

export interface PortfolioSummary {
  version: "1";
  generatedAt: string;
  auditRoot: string;
  targets: Array<{
    targetUrl: string;
    runs: number;
    latestReportPath: string;
    latestScore: number;
    previousScore: number | null;
    scoreDelta: number | null;
    latestQualityGate: string;
    latestCompletedAt: string;
  }>;
  totals: {
    targets: number;
    runs: number;
    passingLatestRuns: number;
    failingLatestRuns: number;
  };
}

export async function initProject(options: InitProjectOptions): Promise<WorkflowProject> {
  const workspacePath = resolve(options.workspacePath ?? WORKSPACE_FILE);
  if (!options.overwrite && (await exists(workspacePath))) {
    throw new Error(`${workspacePath} already exists. Pass --overwrite to replace it.`);
  }
  const targetUrl = normalizePublicUrl(options.url);
  const now = new Date().toISOString();
  const projectId = `project_${slug(options.name ?? new URL(targetUrl).hostname)}`;
  const target: WorkflowTarget = {
    id: `target_${slug(options.targetName ?? new URL(targetUrl).hostname)}`,
    name: options.targetName ?? new URL(targetUrl).hostname,
    url: targetUrl,
    defaultMode: options.mode ?? "quick-audit",
    ...(options.repoPath ? { repoPath: resolve(options.repoPath) } : {}),
    ...(options.auditName ? { auditName: options.auditName } : {})
  };
  const project: WorkflowProject = {
    version: "1",
    projectId,
    name: options.name ?? target.name,
    createdAt: now,
    updatedAt: now,
    auditRoot: resolve(options.auditRoot ?? "audit-reports"),
    targets: [target]
  };
  await mkdir(dirname(workspacePath), { recursive: true });
  await writeJson(workspacePath, project);
  return project;
}

export async function loadProject(workspacePath = WORKSPACE_FILE): Promise<WorkflowProject> {
  const project = await readJson<WorkflowProject>(resolve(workspacePath));
  if (project.version !== "1" || !project.projectId || project.targets.length === 0) {
    throw new Error(`Invalid SEO Polish workspace: ${resolve(workspacePath)}`);
  }
  return project;
}

export async function runWorkflow(options: RunWorkflowOptions = {}): Promise<WorkflowState> {
  const project = await loadProject(options.workspacePath);
  const target = selectTarget(project, options.targetId);
  const mode = options.mode ?? target.defaultMode;
  const state = createWorkflowState(project, target, mode, options.baselinePath);
  const stateDir = workflowStateDir(project.auditRoot, state.workflowId);
  await persistState(stateDir, state);
  await writeJson(join(stateDir, PROJECT_SNAPSHOT_FILE), project);

  try {
    await startPhase(stateDir, state, "preflight", "Checking target, repository and workflow inputs.");
    await preflightTarget(target, mode);
    await completePhase(stateDir, state, "preflight", "Inputs are valid and the workflow can run.", [
      resolve(options.workspacePath ?? WORKSPACE_FILE)
    ]);

    await startPhase(stateDir, state, "scan", "Collecting live evidence and rendering the report bundle.");
    const scan = await runScan({
      url: target.url,
      auditRoot: project.auditRoot,
      auditName: target.auditName ?? target.name,
      ...(target.repoPath ? { repoPath: target.repoPath } : {}),
      ...(options.baselinePath ? { baselinePath: resolve(options.baselinePath) } : {}),
      ...(options.browserEvidence !== undefined ? { includeBrowserEvidence: options.browserEvidence } : {}),
      ...(options.coreWebVitals !== undefined ? { includeCoreWebVitals: options.coreWebVitals } : {}),
      ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {})
    });
    state.reportDir = resolve(scan.reportPath);
    await completePhase(stateDir, state, "scan", "Live scan and report generation completed.", [
      state.reportDir,
      join(state.reportDir, "findings.json"),
      join(state.reportDir, "evidence.jsonl")
    ]);
    await mirrorStateIntoReport(stateDir, state);

    await startPhase(
      stateDir,
      state,
      "evidence_gate",
      "Checking evidence, scoring coverage and report artifacts."
    );
    const evidenceGate = await evaluateEvidenceGate(state.reportDir);
    if (!evidenceGate.ok) {
      throw new Error(`Evidence quality gate failed: ${evidenceGate.reasons.join("; ")}`);
    }
    await completePhase(
      stateDir,
      state,
      "evidence_gate",
      `Evidence gate passed with ${evidenceGate.coveragePercent}% applicable-rule coverage.`,
      [join(state.reportDir, "rule-evaluations.json"), join(state.reportDir, "score.json")]
    );

    state.decisions = await buildDecisionQueue(state.reportDir);
    if (mode === "full-remediation" && target.repoPath) {
      const changeSet = await planChangeSet({ reportDir: state.reportDir, repoPath: target.repoPath });
      state.decisions.push(...changeSetApprovalDecisions(changeSet, state.decisions));
    }
    await writeJson(join(stateDir, DECISIONS_FILE), state.decisions);
    await writeJson(join(state.reportDir, DECISIONS_FILE), state.decisions);

    if (mode === "quick-audit" || mode === "monitor" || mode === "pr-regression") {
      await skipNonAuditPhases(stateDir, state, mode);
      await verifyAndComplete(stateDir, state, target, false);
      return state;
    }

    return await continueFullRemediation(
      stateDir,
      state,
      target,
      options.applySafe === true,
      false,
      options.verificationUrl
    );
  } catch (error) {
    await failCurrentPhase(stateDir, state, errorMessage(error));
    throw error;
  }
}

export async function resumeWorkflow(options: ResumeWorkflowOptions): Promise<WorkflowState> {
  const statePath = resolveStatePath(options.statePath);
  const stateDir = dirname(statePath);
  const state = await readJson<WorkflowState>(statePath);
  const project = await projectForState(state, stateDir);
  const target = selectTarget(project, state.targetId);
  if (state.status === "complete") {
    return state;
  }
  if (state.mode !== "full-remediation") {
    return verifyAndComplete(stateDir, state, target, options.runProjectChecks === true);
  }
  return continueFullRemediation(
    stateDir,
    state,
    target,
    options.applySafe === true,
    options.runProjectChecks === true,
    options.verificationUrl
  );
}

export async function recordDecision(input: DecisionInput): Promise<WorkflowState> {
  const statePath = resolveStatePath(input.statePath);
  const stateDir = dirname(statePath);
  const state = await readJson<WorkflowState>(statePath);
  const decision = state.decisions.find((item) => item.id === input.decisionId);
  if (!decision) {
    throw new Error(`Unknown workflow decision: ${input.decisionId}`);
  }
  if (
    input.selectedOption &&
    decision.options.length > 0 &&
    !decision.options.includes(input.selectedOption)
  ) {
    throw new Error(`Invalid option for ${decision.id}: ${input.selectedOption}`);
  }
  decision.status = input.status;
  if (input.selectedOption) decision.selectedOption = input.selectedOption;
  if (input.note) decision.note = input.note;
  decision.decidedBy = input.decidedBy ?? "owner";
  decision.decidedAt = new Date().toISOString();
  state.updatedAt = decision.decidedAt;
  await persistState(stateDir, state);
  await writeJson(join(stateDir, DECISIONS_FILE), state.decisions);
  if (state.reportDir) {
    await writeJson(join(state.reportDir, DECISIONS_FILE), state.decisions);
  }
  await appendEvent(stateDir, state, {
    type: "decision_recorded",
    phase: "decisions",
    message: `${decision.id} recorded as ${decision.status}.`,
    artifacts: [join(stateDir, DECISIONS_FILE)]
  });
  return state;
}

export async function importAgentReview(statePathInput: string, reviewPath: string): Promise<WorkflowState> {
  const statePath = resolveStatePath(statePathInput);
  const stateDir = dirname(statePath);
  const state = await readJson<WorkflowState>(statePath);
  if (!state.reportDir) {
    throw new Error("The workflow has no report directory yet.");
  }
  const review = await readJson<AgentReview>(resolve(reviewPath));
  if (review.status !== "complete" || review.reviewer === "pending") {
    throw new Error("Imported agent review must be complete and identify a non-pending reviewer.");
  }
  if (
    review.targetUrl !==
    (await readJson<{ config: { url: string } }>(join(state.reportDir, "scan-result.json"))).config.url
  ) {
    throw new Error("Imported agent review target does not match the workflow target.");
  }
  await writeJson(join(state.reportDir, "agent-review.json"), review);
  await runReportRender(state.reportDir);
  await appendEvent(stateDir, state, {
    type: "artifact_written",
    phase: "review",
    message: "Completed agent review imported and report rerendered.",
    artifacts: [join(state.reportDir, "agent-review.json")]
  });
  await persistState(stateDir, state);
  return state;
}

export async function importWorkflowRetrospective(
  statePathInput: string,
  retrospectivePath: string
): Promise<WorkflowState> {
  const statePath = resolveStatePath(statePathInput);
  const stateDir = dirname(statePath);
  const state = await readJson<WorkflowState>(statePath);
  if (!state.reportDir) throw new Error("The workflow has no report directory yet.");
  const retrospective = await readJson<WorkflowRetrospective>(resolve(retrospectivePath));
  if (retrospective.status !== "complete" || retrospective.reviewer === "pending") {
    throw new Error("Imported workflow retrospective must be complete and identify a non-pending reviewer.");
  }
  const targetUrl = (await readJson<{ config: { url: string } }>(join(state.reportDir, "scan-result.json")))
    .config.url;
  if (retrospective.targetUrl !== targetUrl) {
    throw new Error("Imported workflow retrospective target does not match the current verification report.");
  }
  await writeJson(join(state.reportDir, "workflow-retrospective.json"), retrospective);
  await runReportRender(state.reportDir);
  await appendEvent(stateDir, state, {
    type: "artifact_written",
    phase: "retrospective",
    message: "Completed workflow retrospective imported and report rerendered.",
    artifacts: [join(state.reportDir, "workflow-retrospective.json")]
  });
  await persistState(stateDir, state);
  await mirrorStateIntoReport(stateDir, state);
  return state;
}

export async function readWorkflowState(path: string): Promise<WorkflowState> {
  return readJson<WorkflowState>(resolveStatePath(path));
}

export async function verifyWorkflow(
  statePathInput: string,
  runProjectChecks = false
): Promise<VerificationManifest> {
  const statePath = resolveStatePath(statePathInput);
  const stateDir = dirname(statePath);
  const state = await readJson<WorkflowState>(statePath);
  const project = await projectForState(state, stateDir);
  const target = selectTarget(project, state.targetId);
  return buildVerification(stateDir, state, target, runProjectChecks);
}

export async function compareReports(
  baselineReportInput: string,
  currentReportInput: string,
  outputPathInput?: string
): Promise<WorkflowComparison> {
  const baselineReport = resolve(baselineReportInput);
  const currentReport = resolve(currentReportInput);
  const [baselineScore, currentScore, baselineFindings, currentFindings] = await Promise.all([
    readJson<Score>(join(baselineReport, "score.json")),
    readJson<Score>(join(currentReport, "score.json")),
    readJson<Array<{ id: string; severity: string; affectedTemplates: string[]; affectedUrls: string[] }>>(
      join(baselineReport, "findings.json")
    ),
    readJson<Array<{ id: string; severity: string; affectedTemplates: string[]; affectedUrls: string[] }>>(
      join(currentReport, "findings.json")
    )
  ]);
  const baselineGroups = findingGroupMap(baselineFindings);
  const currentGroups = findingGroupMap(currentFindings);
  const newFindingGroups = [...currentGroups.keys()].filter((key) => !baselineGroups.has(key)).sort();
  const resolvedFindingGroups = [...baselineGroups.keys()].filter((key) => !currentGroups.has(key)).sort();
  const recurringFindingGroups = [...currentGroups.keys()].filter((key) => baselineGroups.has(key)).sort();
  const newCriticalHigh = newFindingGroups.filter((key) => {
    const severity = currentGroups.get(key)?.severity;
    return severity === "critical" || severity === "high";
  });
  const scoreDelta = currentScore.total - baselineScore.total;
  const verdict =
    newCriticalHigh.length > 0 || scoreDelta < 0 ? "regressed" : scoreDelta > 0 ? "improved" : "unchanged";
  const comparison: WorkflowComparison = {
    version: "1",
    generatedAt: new Date().toISOString(),
    baselineReport,
    currentReport,
    scoreDelta,
    experimentalScoreDelta:
      (currentScore.experimentalCombined ?? currentScore.total) -
      (baselineScore.experimentalCombined ?? baselineScore.total),
    coverageDelta:
      (currentScore.coverage?.percentMeasured ?? 0) - (baselineScore.coverage?.percentMeasured ?? 0),
    newFindingGroups,
    resolvedFindingGroups,
    recurringFindingGroups,
    newCriticalHigh,
    verdict,
    regressionGate: verdict === "regressed" ? "failed" : "passed"
  };
  await writeJson(resolve(outputPathInput ?? join(currentReport, "workflow-comparison.json")), comparison);
  return comparison;
}

export async function buildPortfolio(
  auditRootInput: string,
  outputPathInput?: string
): Promise<PortfolioSummary> {
  const auditRoot = resolve(auditRootInput);
  const index = await readOptionalJson<{ runs?: Array<Record<string, unknown>> }>(
    join(auditRoot, "audit-index.json")
  );
  const runs = Array.isArray(index?.runs) ? index.runs : await discoverAuditRuns(auditRoot);
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const run of runs) {
    const targetUrl = normalizePortfolioTarget(String(run["targetUrl"] ?? "unknown"));
    grouped.set(targetUrl, [...(grouped.get(targetUrl) ?? []), run]);
  }
  const targets = [...grouped.entries()]
    .map(([targetUrl, targetRuns]) => {
      const sorted = [...targetRuns].sort((left, right) =>
        String(right["completedAt"] ?? "").localeCompare(String(left["completedAt"] ?? ""))
      );
      const latest = sorted[0] ?? {};
      const previous = sorted[1];
      const latestScore = Number(latest["score"] ?? 0);
      const previousScore = previous ? Number(previous["score"] ?? 0) : null;
      return {
        targetUrl,
        runs: sorted.length,
        latestReportPath: String(latest["reportPath"] ?? ""),
        latestScore,
        previousScore,
        scoreDelta: previousScore === null ? null : latestScore - previousScore,
        latestQualityGate: String(latest["qualityGateStatus"] ?? "unknown"),
        latestCompletedAt: String(latest["completedAt"] ?? "")
      };
    })
    .sort((left, right) => left.targetUrl.localeCompare(right.targetUrl));
  const summary: PortfolioSummary = {
    version: "1",
    generatedAt: new Date().toISOString(),
    auditRoot,
    targets,
    totals: {
      targets: targets.length,
      runs: targets.reduce((sum, target) => sum + target.runs, 0),
      passingLatestRuns: targets.filter((target) => target.latestQualityGate === "passed").length,
      failingLatestRuns: targets.filter((target) => target.latestQualityGate !== "passed").length
    }
  };
  await writeJson(resolve(outputPathInput ?? join(auditRoot, "portfolio.json")), summary);
  return summary;
}

function normalizePortfolioTarget(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

async function continueFullRemediation(
  stateDir: string,
  state: WorkflowState,
  target: WorkflowTarget,
  applySafe: boolean,
  runProjectChecks: boolean,
  verificationUrl?: string
): Promise<WorkflowState> {
  if (!state.reportDir) throw new Error("Cannot resume before a scan report exists.");

  const applyPhase = phaseFor(state, "apply");
  if (applyPhase.status === "complete" && state.currentPhase === "verify" && verificationUrl) {
    return runVerificationScan(stateDir, state, target, verificationUrl);
  }

  const review = await readJson<AgentReview>(join(state.reportDir, "agent-review.json"));
  if (review.status !== "complete") {
    await blockPhase(
      stateDir,
      state,
      "review",
      "A completed evidence-linked agent review must be imported before remediation can continue."
    );
    state.status = "awaiting_approval";
    state.stopReasons = ["agent review incomplete"];
    await persistState(stateDir, state);
    await mirrorStateIntoReport(stateDir, state);
    return state;
  }
  await completePhase(stateDir, state, "review", "Evidence-linked agent review is complete.", [
    join(state.reportDir, "agent-review.json")
  ]);

  const unresolved = state.decisions.filter((decision) => decision.status === "pending");
  if (unresolved.length > 0) {
    await blockPhase(
      stateDir,
      state,
      "decisions",
      `${unresolved.length} owner decision${unresolved.length === 1 ? " remains" : "s remain"}.`
    );
    state.status = "awaiting_approval";
    state.stopReasons = unresolved.map((decision) => `pending decision: ${decision.id}`);
    await persistState(stateDir, state);
    await mirrorStateIntoReport(stateDir, state);
    return state;
  }
  await completePhase(stateDir, state, "decisions", "All owner decisions have recorded dispositions.", [
    join(state.reportDir, DECISIONS_FILE)
  ]);

  if (applyPhase.status === "complete") {
    return verifyAndComplete(stateDir, state, target, runProjectChecks);
  }

  await completePhase(stateDir, state, "plan", "The evidence-backed remediation plan is ready.", [
    join(state.reportDir, "remediation-plan.json"),
    join(state.reportDir, "patch.diff"),
    join(state.reportDir, "change-set.json"),
    join(state.reportDir, "change-set.diff")
  ]);
  if (applySafe) {
    const changeSet = await readJson<ChangeSet>(join(state.reportDir, "change-set.json"));
    const approvedChangeIds = changeSet.changes
      .filter((change) => {
        if (!change.approvalRequired) return true;
        const decision = state.decisions.find((item) => item.id === changeDecisionId(change.findingId));
        return decision?.status === "approved";
      })
      .map((change) => change.id);
    const applied = await applyChangeSet({
      changeSet,
      approvedChangeIds,
      skipUnapproved: true
    });
    if (applied.status === "failed") {
      throw new Error(
        `Framework adapter failed to apply the approved change set: ${applied.failedChanges.map((item) => item.reason).join("; ")}`
      );
    }
    await completePhase(
      stateDir,
      state,
      "apply",
      `Applied ${applied.appliedChangeIds.length} approved bounded change${applied.appliedChangeIds.length === 1 ? "" : "s"}; ${applied.skippedChangeIds.length} unapproved sensitive change${applied.skippedChangeIds.length === 1 ? " was" : "s were"} preserved.`,
      [join(state.reportDir, "change-set.json"), join(state.reportDir, "change-set.diff")]
    );
    if (!verificationUrl) {
      await blockPhase(
        stateDir,
        state,
        "verify",
        "Approved changes were applied, but a deployed preview or production verification URL is required for a fresh scan."
      );
      state.status = "awaiting_approval";
      state.stopReasons = ["fresh verification URL required after repository changes"];
      await persistState(stateDir, state);
      await mirrorStateIntoReport(stateDir, state);
      return state;
    }
    return runVerificationScan(stateDir, state, target, verificationUrl);
  } else {
    await blockPhase(
      stateDir,
      state,
      "apply",
      "The workflow is ready to apply approved safe changes; resume with --apply-safe after reviewing the change set."
    );
    state.status = "awaiting_approval";
    state.stopReasons = ["safe change-set application not approved"];
    await persistState(stateDir, state);
    await mirrorStateIntoReport(stateDir, state);
    return state;
  }
}

async function runVerificationScan(
  stateDir: string,
  state: WorkflowState,
  target: WorkflowTarget,
  verificationUrl: string
): Promise<WorkflowState> {
  if (!state.reportDir) throw new Error("Cannot run verification without the pre-change report.");
  const baselineReport = state.reportDir;
  const auditRoot = dirname(dirname(stateDir));
  await startPhase(
    stateDir,
    state,
    "verify",
    "Scanning the deployed verification target and comparing it to the pre-change baseline."
  );
  const scan = await runScan({
    url: normalizePublicUrl(verificationUrl),
    auditRoot,
    auditName: `${target.auditName ?? target.name} verification`,
    baselinePath: baselineReport,
    ...(target.repoPath ? { repoPath: target.repoPath } : {})
  });
  state.baselinePath = baselineReport;
  state.reportDir = resolve(scan.reportPath);
  const comparison = await compareReports(baselineReport, state.reportDir);
  await appendEvent(stateDir, state, {
    type: "artifact_written",
    phase: "verify",
    message: `Verification scan completed with ${signed(comparison.scoreDelta)} core score delta and ${comparison.newCriticalHigh.length} new critical/high groups.`,
    artifacts: [state.reportDir, join(state.reportDir, "workflow-comparison.json")]
  });
  const reviewPhase = phaseFor(state, "review");
  reviewPhase.status = "blocked";
  reviewPhase.message = "Complete a final evidence-linked review of the post-change verification report.";
  delete reviewPhase.completedAt;
  state.currentPhase = "review";
  state.status = "awaiting_approval";
  state.stopReasons = ["final verification report review incomplete"];
  await persistState(stateDir, state);
  await mirrorStateIntoReport(stateDir, state);
  return state;
}

async function verifyAndComplete(
  stateDir: string,
  state: WorkflowState,
  target: WorkflowTarget,
  runProjectChecks: boolean
): Promise<WorkflowState> {
  await startPhase(stateDir, state, "verify", "Validating report artifacts and configured project gates.");
  const verification = await buildVerification(stateDir, state, target, runProjectChecks);
  if (!verification.ok) {
    throw new Error(`Verification failed: ${verification.stopReasons.join("; ")}`);
  }
  await completePhase(stateDir, state, "verify", "Verification manifest passed.", [
    join(state.reportDir ?? stateDir, VERIFICATION_FILE)
  ]);
  if (state.mode === "full-remediation" && state.reportDir) {
    const [retrospective, completion] = await Promise.all([
      readOptionalJson<WorkflowRetrospective>(join(state.reportDir, "workflow-retrospective.json")),
      readOptionalJson<{ status?: string }>(join(state.reportDir, "workflow-completion.json"))
    ]);
    if (retrospective?.status !== "complete" || completion?.status !== "complete") {
      await blockPhase(
        stateDir,
        state,
        "retrospective",
        "Complete and import the evidence-linked workflow retrospective before final completion."
      );
      state.status = "awaiting_approval";
      state.stopReasons = ["workflow retrospective incomplete"];
      await persistState(stateDir, state);
      await mirrorStateIntoReport(stateDir, state);
      return state;
    }
    await completePhase(
      stateDir,
      state,
      "retrospective",
      "Workflow retrospective and completion gate passed.",
      [
        join(state.reportDir, "workflow-retrospective.json"),
        join(state.reportDir, "workflow-completion.json")
      ]
    );
  }
  await completePhase(
    stateDir,
    state,
    "complete",
    "Workflow completed with its declared scope and limitations.",
    [state.reportDir ?? stateDir]
  );
  state.status = "complete";
  state.currentPhase = "complete";
  state.stopReasons = [];
  state.updatedAt = new Date().toISOString();
  await persistState(stateDir, state);
  await mirrorStateIntoReport(stateDir, state);
  return state;
}

async function buildVerification(
  stateDir: string,
  state: WorkflowState,
  target: WorkflowTarget,
  runProjectChecks: boolean
): Promise<VerificationManifest> {
  if (!state.reportDir) throw new Error("Cannot verify a workflow without a report directory.");
  const validation = await runValidate(state.reportDir, state.mode === "full-remediation");
  const score = await readJson<Score>(join(state.reportDir, "score.json"));
  const commands = runProjectChecks && target.repoPath ? await projectChecks(target.repoPath) : [];
  const failedCommands = commands.filter((command) => command.status === "failed");
  const reportValid = validation.ok;
  const reportValidityRequired = state.mode === "full-remediation";
  const stopReasons = [
    ...(reportValidityRequired && !reportValid ? ["strict report validation failed"] : []),
    ...failedCommands.map((command) => `project command failed: ${command.command}`)
  ];
  const manifest: VerificationManifest = {
    version: "1",
    generatedAt: new Date().toISOString(),
    workflowId: state.workflowId,
    reportDir: state.reportDir,
    ok: stopReasons.length === 0,
    reportValid,
    primaryScore: score.total,
    experimentalScore: score.experimentalCombined,
    coveragePercent: score.coverage.percentMeasured,
    baselineStatus: state.baselinePath ? "ok" : "not_configured",
    commands,
    stopReasons
  };
  await writeJson(join(stateDir, VERIFICATION_FILE), manifest);
  await writeJson(join(state.reportDir, VERIFICATION_FILE), manifest);
  return manifest;
}

async function projectChecks(repoPath: string): Promise<VerificationManifest["commands"]> {
  const packageJson = await readOptionalJson<{ scripts?: Record<string, string> }>(
    join(repoPath, "package.json")
  );
  if (!packageJson) return [];
  const packageManager = await detectPackageManager(repoPath);
  const commands = ["lint", "typecheck", "test", "build", "security"].filter(
    (script) => packageJson.scripts?.[script]
  );
  const results: VerificationManifest["commands"] = [];
  for (const script of commands) {
    results.push(await runCommand(packageManager, ["run", script], repoPath));
  }
  return results;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<VerificationManifest["commands"][number]> {
  const started = Date.now();
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > 24_000) output = output.slice(-24_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      resolveResult({
        command: [command, ...args].join(" "),
        status: "failed",
        exitCode: null,
        durationMs: Date.now() - started,
        outputExcerpt: error.message
      });
    });
    child.on("close", (code) => {
      resolveResult({
        command: [command, ...args].join(" "),
        status: code === 0 ? "passed" : "failed",
        exitCode: code,
        durationMs: Date.now() - started,
        outputExcerpt: output.slice(-4_000)
      });
    });
  });
}

async function evaluateEvidenceGate(reportDir: string): Promise<{
  ok: boolean;
  reasons: string[];
  coveragePercent: number;
}> {
  const findings = await readJson<Array<{ id: string; evidence?: unknown[] }>>(
    join(reportDir, "findings.json")
  );
  const score = await readJson<Score>(join(reportDir, "score.json"));
  const missingEvidence = findings.filter((finding) => !finding.evidence || finding.evidence.length === 0);
  const reasons = [
    ...(missingEvidence.length > 0 ? [`${missingEvidence.length} findings have no evidence`] : []),
    ...(score.coverage.applicableRules > 0 && score.coverage.measuredRules === 0
      ? ["no applicable deterministic rules were measured"]
      : [])
  ];
  return { ok: reasons.length === 0, reasons, coveragePercent: score.coverage.percentMeasured };
}

async function buildDecisionQueue(reportDir: string): Promise<WorkflowDecision[]> {
  const [plan, findings] = await Promise.all([
    readJson<RemediationPlan>(join(reportDir, "remediation-plan.json")),
    readJson<Array<{ id: string }>>(join(reportDir, "findings.json"))
  ]);
  const findingIds = new Set(findings.map((finding) => finding.id));
  const decisions: WorkflowDecision[] = plan.userDecisions
    .filter((decision) => decisionRelevant(decision.id, findingIds))
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      reason: decision.reason,
      status: "pending",
      sensitive: true,
      findingIds: [],
      options: decision.options
    }));
  for (const item of plan.approvalRequired) {
    const id = `finding-${item.findingId.toLowerCase()}`;
    if (decisions.some((decision) => decision.id === id)) continue;
    decisions.push({
      id,
      title: item.title,
      reason: item.approvalReason ?? "This remediation is classified as approval-required.",
      status: "pending",
      sensitive: true,
      findingIds: [item.findingId],
      options: ["approve", "reject", "defer"]
    });
  }
  return decisions;
}

function decisionRelevant(decisionId: string, findingIds: Set<string>): boolean {
  const prefixes: Record<string, string[]> = {
    "ai-input-policy": ["AR-ROBOTS-004"],
    "ai-training-policy": ["AR-ROBOTS-004"],
    "mcp-publication": ["AR-MCP-"],
    "authenticated-agent-access": ["AR-AUTH-"],
    indexnow: ["SEO-SEARCH-"]
  };
  const related = prefixes[decisionId];
  return (
    !related || [...findingIds].some((findingId) => related.some((prefix) => findingId.startsWith(prefix)))
  );
}

function changeSetApprovalDecisions(changeSet: ChangeSet, existing: WorkflowDecision[]): WorkflowDecision[] {
  const existingIds = new Set(existing.map((decision) => decision.id));
  const decisions: WorkflowDecision[] = [];
  for (const change of changeSet.changes.filter((item) => item.approvalRequired)) {
    const id = changeDecisionId(change.findingId);
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    decisions.push({
      id,
      title: `Approve ${change.findingId} change`,
      reason: `${change.reason} Sensitive area: ${change.sensitiveArea ?? "unspecified"}.`,
      status: "pending",
      sensitive: true,
      findingIds: [change.findingId],
      options: ["approve", "reject", "defer"]
    });
  }
  return decisions;
}

function changeDecisionId(findingId: string): string {
  return `finding-${findingId.toLowerCase()}`;
}

async function skipNonAuditPhases(stateDir: string, state: WorkflowState, mode: WorkflowMode): Promise<void> {
  await skipPhase(
    stateDir,
    state,
    "review",
    `${mode} mode does not require a strategic review to finish its audit scope.`
  );
  await skipPhase(
    stateDir,
    state,
    "decisions",
    `${mode} mode records decisions but does not require resolution.`
  );
  await skipPhase(
    stateDir,
    state,
    "plan",
    `${mode} mode preserves the generated plan without entering remediation.`
  );
  await skipPhase(stateDir, state, "apply", `${mode} mode never applies repository changes.`);
  await skipPhase(
    stateDir,
    state,
    "retrospective",
    `${mode} mode does not require a maintainer retrospective.`
  );
}

function createWorkflowState(
  project: WorkflowProject,
  target: WorkflowTarget,
  mode: WorkflowMode,
  baselinePath?: string
): WorkflowState {
  const now = new Date().toISOString();
  return {
    version: "1",
    workflowId: `workflow_${timestampId()}_${randomUUID().slice(0, 8)}`,
    projectId: project.projectId,
    targetId: target.id,
    mode,
    status: "initialized",
    currentPhase: "preflight",
    createdAt: now,
    updatedAt: now,
    ...(baselinePath ? { baselinePath: resolve(baselinePath) } : {}),
    phases: PHASE_IDS.map((id) => ({ id, status: "pending", message: "Pending.", artifacts: [] })),
    decisions: [],
    stopReasons: []
  };
}

async function startPhase(
  stateDir: string,
  state: WorkflowState,
  phaseId: WorkflowPhaseId,
  message: string
): Promise<void> {
  const phase = phaseFor(state, phaseId);
  phase.status = "running";
  phase.startedAt = phase.startedAt ?? new Date().toISOString();
  phase.message = message;
  state.currentPhase = phaseId;
  state.status = "running";
  state.updatedAt = new Date().toISOString();
  await persistState(stateDir, state);
  await appendEvent(stateDir, state, { type: "phase_started", phase: phaseId, message, artifacts: [] });
}

async function completePhase(
  stateDir: string,
  state: WorkflowState,
  phaseId: WorkflowPhaseId,
  message: string,
  artifacts: string[]
): Promise<void> {
  const phase = phaseFor(state, phaseId);
  phase.status = "complete";
  phase.startedAt = phase.startedAt ?? new Date().toISOString();
  phase.completedAt = new Date().toISOString();
  phase.message = message;
  phase.artifacts = unique(artifacts);
  state.currentPhase = phaseId;
  state.updatedAt = phase.completedAt;
  await persistState(stateDir, state);
  await appendEvent(stateDir, state, {
    type: "phase_completed",
    phase: phaseId,
    message,
    artifacts: phase.artifacts
  });
  await mirrorStateIntoReport(stateDir, state);
}

async function blockPhase(
  stateDir: string,
  state: WorkflowState,
  phaseId: WorkflowPhaseId,
  message: string
): Promise<void> {
  const phase = phaseFor(state, phaseId);
  phase.status = "blocked";
  phase.startedAt = phase.startedAt ?? new Date().toISOString();
  phase.message = message;
  state.currentPhase = phaseId;
  state.updatedAt = new Date().toISOString();
  await persistState(stateDir, state);
  await mirrorStateIntoReport(stateDir, state);
}

async function skipPhase(
  stateDir: string,
  state: WorkflowState,
  phaseId: WorkflowPhaseId,
  message: string
): Promise<void> {
  const phase = phaseFor(state, phaseId);
  phase.status = "skipped";
  phase.message = message;
  phase.completedAt = new Date().toISOString();
  state.updatedAt = phase.completedAt;
  await persistState(stateDir, state);
}

async function failCurrentPhase(stateDir: string, state: WorkflowState, message: string): Promise<void> {
  const phase = phaseFor(state, state.currentPhase);
  phase.status = "failed";
  phase.completedAt = new Date().toISOString();
  phase.message = message;
  state.status = "failed";
  state.lastError = message;
  state.stopReasons = [message];
  state.updatedAt = phase.completedAt;
  await persistState(stateDir, state);
  await appendEvent(stateDir, state, {
    type: "phase_failed",
    phase: phase.id,
    message,
    artifacts: []
  });
  await mirrorStateIntoReport(stateDir, state);
}

async function persistState(stateDir: string, state: WorkflowState): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeJson(join(stateDir, WORKFLOW_STATE_FILE), state);
}

async function mirrorStateIntoReport(stateDir: string, state: WorkflowState): Promise<void> {
  if (!state.reportDir) return;
  await writeJson(join(state.reportDir, WORKFLOW_STATE_FILE), state);
  const events = await readOptionalText(join(stateDir, WORKFLOW_EVENTS_FILE));
  if (events !== null) await writeFile(join(state.reportDir, WORKFLOW_EVENTS_FILE), events, "utf8");
  const projectSnapshot = await readOptionalText(join(stateDir, PROJECT_SNAPSHOT_FILE));
  if (projectSnapshot !== null) {
    await writeFile(join(state.reportDir, PROJECT_SNAPSHOT_FILE), projectSnapshot, "utf8");
  }
  await updateAuditRunWorkflow(state.reportDir, state);
}

async function appendEvent(
  stateDir: string,
  state: WorkflowState,
  event: Omit<WorkflowEvent, "id" | "timestamp">
): Promise<void> {
  const record: WorkflowEvent = {
    id: `event_${randomUUID().slice(0, 12)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  await mkdir(stateDir, { recursive: true });
  await appendFile(join(stateDir, WORKFLOW_EVENTS_FILE), `${JSON.stringify(record)}\n`, "utf8");
  if (state.reportDir) {
    await appendFile(join(state.reportDir, WORKFLOW_EVENTS_FILE), `${JSON.stringify(record)}\n`, "utf8");
  }
}

async function preflightTarget(target: WorkflowTarget, mode: WorkflowMode): Promise<void> {
  normalizePublicUrl(target.url);
  if (mode === "full-remediation" && !target.repoPath) {
    throw new Error("Full remediation mode requires a configured website source repository.");
  }
  if (target.repoPath) {
    const info = await stat(target.repoPath).catch(() => null);
    if (!info?.isDirectory())
      throw new Error(`Configured repository is not a readable directory: ${target.repoPath}`);
  }
}

async function projectForState(state: WorkflowState, stateDir: string): Promise<WorkflowProject> {
  const snapshot = await readOptionalJson<WorkflowProject>(join(stateDir, PROJECT_SNAPSHOT_FILE));
  if (snapshot?.projectId === state.projectId) return snapshot;
  const direct = await readOptionalJson<WorkflowProject>(resolve(WORKSPACE_FILE));
  if (direct?.projectId === state.projectId) return direct;
  throw new Error(`Could not locate ${WORKSPACE_FILE} for workflow project ${state.projectId}.`);
}

function selectTarget(project: WorkflowProject, targetId?: string): WorkflowTarget {
  const target = targetId
    ? project.targets.find((item) => item.id === targetId)
    : project.targets.length === 1
      ? project.targets[0]
      : undefined;
  if (!target) {
    throw new Error(
      targetId ? `Unknown target: ${targetId}` : "Select a target in a multi-target workspace."
    );
  }
  return target;
}

function phaseFor(state: WorkflowState, phaseId: WorkflowPhaseId): WorkflowPhase {
  const phase = state.phases.find((item) => item.id === phaseId);
  if (!phase) throw new Error(`Workflow phase is missing: ${phaseId}`);
  return phase;
}

function resolveStatePath(path: string): string {
  const absolute = resolve(path);
  return basename(absolute) === WORKFLOW_STATE_FILE ? absolute : join(absolute, WORKFLOW_STATE_FILE);
}

function workflowStateDir(auditRoot: string, workflowId: string): string {
  return join(resolve(auditRoot), ".workflow", workflowId);
}

function normalizePublicUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Workflow target must use http or https.");
  url.hash = "";
  return url.toString();
}

async function detectPackageManager(repoPath: string): Promise<string> {
  if (await exists(join(repoPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(repoPath, "yarn.lock"))) return "yarn";
  if (await exists(join(repoPath, "bun.lock"))) return "bun";
  return "npm";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "site"
  );
}

function timestampId(): string {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function findingGroupMap(
  findings: Array<{ id: string; severity: string; affectedTemplates: string[]; affectedUrls: string[] }>
): Map<string, { severity: string }> {
  const map = new Map<string, { severity: string }>();
  for (const finding of findings) {
    const scopes = finding.affectedTemplates.length > 0 ? finding.affectedTemplates : finding.affectedUrls;
    const normalizedScopes = scopes.length > 0 ? scopes : ["unscoped"];
    for (const scope of normalizedScopes) {
      map.set(`${finding.id}|${scope}`, { severity: finding.severity });
    }
  }
  return map;
}

async function discoverAuditRuns(auditRoot: string): Promise<Array<Record<string, unknown>>> {
  const runs: Array<Record<string, unknown>> = [];
  const siteEntries = await readdir(auditRoot, { withFileTypes: true }).catch(() => []);
  for (const siteEntry of siteEntries) {
    if (!siteEntry.isDirectory() || siteEntry.name.startsWith(".")) continue;
    const siteDir = join(auditRoot, siteEntry.name);
    const runEntries = await readdir(siteDir, { withFileTypes: true }).catch(() => []);
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      const metadata = await readOptionalJson<Record<string, unknown>>(
        join(siteDir, runEntry.name, "audit-run.json")
      );
      if (metadata) runs.push(metadata);
    }
  }
  return runs;
}

async function updateAuditRunWorkflow(reportDir: string, state: WorkflowState): Promise<void> {
  const path = join(reportDir, "audit-run.json");
  const auditRun = await readOptionalJson<Record<string, unknown>>(path);
  if (!auditRun) return;
  const artifacts = await listReportArtifacts(reportDir);
  await writeJson(path, {
    ...auditRun,
    artifacts,
    workflow: {
      id: state.workflowId,
      mode: state.mode,
      status: state.status,
      currentPhase: state.currentPhase,
      stateFile: WORKFLOW_STATE_FILE,
      eventsFile: WORKFLOW_EVENTS_FILE,
      decisionsFile: DECISIONS_FILE,
      verificationFile: VERIFICATION_FILE
    }
  });
}

async function listReportArtifacts(root: string, current = root): Promise<string[]> {
  const artifacts: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    const path = relative(root, absolute).replace(/\\/g, "/");
    if (path === "exports" || path.startsWith("exports/")) continue;
    if (entry.isDirectory()) artifacts.push(...(await listReportArtifacts(root, absolute)));
    else if (entry.isFile()) artifacts.push(path);
  }
  return artifacts.sort();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

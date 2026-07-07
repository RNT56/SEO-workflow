# Agent remediation handoff

This document is for source-backed remediation work after SEO polish workflow has generated a report bundle. The root README stays focused on user-facing product setup and scan usage; this page contains the operator details for repo-capable agents and human implementers.

## Inputs

End-to-end remediation needs two inputs:

- The live website URL, so the workflow audits what users, crawlers and agents actually receive.
- The website source repository and build system, so safe fixes can be applied, validated and committed.

If only the live URL is available, SEO polish workflow can still produce a full audit and remediation plan. It should not claim that implementation fixes were safely applied without source access.

## Audit storage

Do not scatter audit output into the website source tree by default. Store each run as a complete,
portable folder under an audit root:

```text
audit-reports/
  company-or-domain/
    2026-07-07T081631Z-scan_mradiqnr/
```

When running from the SEO workflow repository, the default `audit-reports/` folder is correct. When a
repo-capable agent is running from the website source repository, pass `--audit-root /path/to/SEO-workflow/audit-reports`
or set `SEO_POLISH_AUDIT_ROOT` so the generated audit stays with the workflow repository instead of
the target website repo. Use `--audit-name` for stable company/customer folder names. Use `--output`
only for explicit one-off paths.

After the report is complete, build a portable package with:

```bash
seo-polish export --report <audit-run-dir> --profile review
seo-polish export --report <audit-run-dir> --profile repo-import
seo-polish export --report <audit-run-dir> --profile full
```

The export command writes `export-manifest.json`, `checksums.sha256` and `LICENSE-NOTICE.md`; zip is
the default format. Local absolute paths are redacted by default unless `--include-private-paths` is
explicitly passed for trusted internal handoff.

Cloud storage is an agent/connector concern, not a core audit concern. If the user explicitly asks and
the agent has Google Drive, Dropbox, S3 or similar access, upload the generated export package. Do not
embed OAuth, sharing or storage secrets into the workflow report itself.

## Source of truth

Treat the generated report bundle as the execution contract. Start with:

- `<audit-run-dir>/agent-execution-plan.md`
- `<audit-run-dir>/agent-review-input.json`
- `<audit-run-dir>/agent-review.json`
- `<audit-run-dir>/search-intent-review.json`
- `<audit-run-dir>/agent-skills-review.json`
- `<audit-run-dir>/copy-recommendations.json`
- `<audit-run-dir>/final-audit.md`
- `<audit-run-dir>/executive-summary.md`
- `<audit-run-dir>/report-dashboard.json`
- `<audit-run-dir>/findings.json`
- `<audit-run-dir>/remediation-plan.json`
- `<audit-run-dir>/actionability.json`
- `<audit-run-dir>/repo-analysis.json`
- `<audit-run-dir>/tech-stack.json`
- `<audit-run-dir>/browser-evidence.json`
- `<audit-run-dir>/field-data.json`
- `<audit-run-dir>/crux-history.json`
- `<audit-run-dir>/search-console.json`
- `<audit-run-dir>/url-inspection.json`
- `<audit-run-dir>/rum-vitals.json`
- `<audit-run-dir>/route-templates.json`
- `<audit-run-dir>/performance-audit.json`
- `<audit-run-dir>/resource-timing.json`
- `<audit-run-dir>/priority-action-plan.md`
- `<audit-run-dir>/patch.diff`
- `<audit-run-dir>/manual-actions.md`
- `<audit-run-dir>/baseline-comparison.json`
- `<audit-run-dir>/suppression-report.json`
- `<audit-run-dir>/remaining-user-decisions.md`
- `<audit-run-dir>/validation.json`
- `<audit-run-dir>/quality-gate.json`
- `<audit-run-dir>/audit-run.json`
- `<audit-run-dir>/standards-registry.json`
- `<audit-run-dir>/agent-instructions/`
- `<audit-run-dir>/exports/`

No evidence means no finding, and no approval means no sensitive policy change.

## Communication contract

Repo-capable agents should run quietly by default. Detailed evidence, logs, plans and reasoning belong in the generated report artifacts, not in chat.

User-facing updates are appropriate only when:

- explicit owner approval is required
- a blocker prevents progress
- a security, privacy or safety boundary is reached
- a long-running step exceeds the expected duration
- a validation gate fails
- the workflow is complete

Do not narrate routine commands, file reads, scans, rerenders, lint passes, obvious next steps or raw command output unless the user explicitly asks for that detail. If the host agent runtime requires progress updates, keep them terse and state only material status changes.

Final responses should include only the report path, final score and readiness status, top three to five actions, validation gates passed or failed, and remaining approval decisions, blockers or measurement limitations.

## Mandatory agent review

The deterministic scanner is the source of truth. The agent review phase comes after evidence collection
and before implementation. A repo-capable agent must complete:

- `agent-review.json`
- `search-intent-review.json`
- `agent-skills-review.json`
- `copy-recommendations.json`
- `copy-recommendations.md`
- `executive-summary.md`
- `final-audit.md`

Every strategic or copy recommendation must cite evidence IDs, finding IDs, affected URLs or source
artifacts from `agent-review-input.json`. The agent may improve clarity, prioritization, search-intent
analysis, agent-skills analysis and copy proposals, but it may not invent field data, customer proof,
commercial claims, repo facts or private context. Canonical/indexing, policy, auth, payment, crawler
policy, MCP mutation, business claims and brand-positioning changes remain approval-gated.

`quality-gate.json`, `production-readiness.json` and `report lint --strict` stay failed until the review
is complete and evidence-linked.

## Execution sequence

Use this sequence inside the website source repository:

```text
Use /path/to/SEO-workflow as the SEO audit and remediation workflow.

Target live site: https://your-site.com
Website source repo: current workspace

Run the workflow end to end:
1. Run quietly by default; message only for approvals, blockers, safety boundaries, long-running delays, failed gates and completion.
2. Build the SEO workflow if needed.
3. Scan the live site into the audit root with --repo pointing at the website source repo when available.
4. Read agent-execution-plan.md, agent-review-input.json and report-dashboard.json first, then findings.json, remediation-plan.json, actionability.json, repo-analysis.json, tech-stack.json, browser-evidence.json, field-data.json, crux-history.json, search-console.json, url-inspection.json, rum-vitals.json, route-templates.json, performance-audit.json, priority-action-plan.md, patch.diff, manual-actions.md, remaining-user-decisions.md, validation.json and benchmark.json if present.
5. Complete the mandatory agent review artifacts, executive summary, copy recommendations and final audit narrative from cited evidence.
6. Run report render and strict report lint; do not implement fixes until the review gate passes.
7. Apply only safe_auto_fix items directly in the website source repo when source candidates are clear and validation commands exist.
8. Treat manual_strategy items as normal implementation work that needs source inspection and engineering judgment.
9. Do not make policy, auth, payment, indexing, canonical, crawler or MCP mutation changes without explicit approval.
10. Preserve approval_required items in remaining-user-decisions.md.
11. Re-run scan, report lint, validation, benchmark, plan build, project tests, build and security checks.
12. Commit and push only after the verification gates pass.
13. Summarize final score, changed files, remaining user decisions and verification results.
```

Recommended scan command:

```bash
pnpm --filter @seo-polish/cli seo-polish scan https://your-site.com \
  --repo . \
  --audit-root /path/to/SEO-workflow/audit-reports \
  --audit-name "Your Site" \
  --browser-evidence \
  --field-data crux \
  --performance-runs 3 \
  --baseline ./previous-seo-polish-report
```

For Search Console or first-party RUM prioritization, add `--field-data gsc --gsc-site <property>` with
`SEO_POLISH_GSC_ACCESS_TOKEN`, or `--field-data rum --rum-file ./rum-vitals.json`. Field data changes
priority and evidence strength; it does not remove approval gates.

## Approval gates

Do not change these without explicit owner approval:

- AI policy
- auth
- payment
- crawler policy
- index/noindex policy
- canonical strategy where ambiguous
- mutating MCP behavior
- product prices
- local business data

Keep unresolved approval items in `remaining-user-decisions.md`.

## Validation checklist

For this repository, the required local gate is:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm test:report-ui
pnpm security
```

For the target website repository, run that project's own lint, typecheck, test, build and security gates in addition to a fresh SEO polish scan and strict report lint.

## Performance evidence boundary

HTTP timing, static resource discovery, third-party cost and budget checks are available in every scan. LCP, INP, CLS and true browser request chains require browser/CDP or field data. When browser evidence is not available, those metrics remain `not_measured` and must not be used as if they were Lighthouse or real-user data.

## Suppressions and baselines

Suppressions are audit ledgers, not deletion rules. A suppression should include an ID, finding ID, reason, owner and expiry, and it should match a precise URL pattern. Suppressed findings remain in `findings.json`.

Baselines compare current score, finding groups and performance metrics with a previous report. Use them to identify regressions and resolved issues after implementation.

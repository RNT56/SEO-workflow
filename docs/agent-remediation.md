# Agent remediation handoff

This document is for source-backed remediation work after SEO polish workflow has generated a report bundle. The root README stays focused on user-facing product setup and scan usage; this page contains the operator details for repo-capable agents and human implementers.

## Inputs

End-to-end remediation needs two inputs:

- The live website URL, so the workflow audits what users, crawlers and agents actually receive.
- The website source repository and build system, so safe fixes can be applied, validated and committed.

If only the live URL is available, SEO polish workflow can still produce a full audit and remediation plan. It should not claim that implementation fixes were safely applied without source access.

## Source of truth

Treat the generated report bundle as the execution contract. Start with:

- `seo-polish-report/agent-execution-plan.md`
- `seo-polish-report/agent-review-input.json`
- `seo-polish-report/agent-review.json`
- `seo-polish-report/search-intent-review.json`
- `seo-polish-report/agent-skills-review.json`
- `seo-polish-report/copy-recommendations.json`
- `seo-polish-report/final-audit.md`
- `seo-polish-report/executive-summary.md`
- `seo-polish-report/report-dashboard.json`
- `seo-polish-report/findings.json`
- `seo-polish-report/remediation-plan.json`
- `seo-polish-report/actionability.json`
- `seo-polish-report/repo-analysis.json`
- `seo-polish-report/tech-stack.json`
- `seo-polish-report/browser-evidence.json`
- `seo-polish-report/field-data.json`
- `seo-polish-report/crux-history.json`
- `seo-polish-report/search-console.json`
- `seo-polish-report/url-inspection.json`
- `seo-polish-report/rum-vitals.json`
- `seo-polish-report/route-templates.json`
- `seo-polish-report/performance-audit.json`
- `seo-polish-report/resource-timing.json`
- `seo-polish-report/priority-action-plan.md`
- `seo-polish-report/patch.diff`
- `seo-polish-report/manual-actions.md`
- `seo-polish-report/baseline-comparison.json`
- `seo-polish-report/suppression-report.json`
- `seo-polish-report/remaining-user-decisions.md`
- `seo-polish-report/validation.json`
- `seo-polish-report/quality-gate.json`
- `seo-polish-report/standards-registry.json`
- `seo-polish-report/agent-instructions/`

No evidence means no finding, and no approval means no sensitive policy change.

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
1. Build the SEO workflow if needed.
2. Scan the live site into ./seo-polish-report with --repo pointing at the website source repo when available.
3. Read agent-execution-plan.md, agent-review-input.json and report-dashboard.json first, then findings.json, remediation-plan.json, actionability.json, repo-analysis.json, tech-stack.json, browser-evidence.json, field-data.json, crux-history.json, search-console.json, url-inspection.json, rum-vitals.json, route-templates.json, performance-audit.json, priority-action-plan.md, patch.diff, manual-actions.md, remaining-user-decisions.md, validation.json and benchmark.json if present.
4. Complete the mandatory agent review artifacts, executive summary, copy recommendations and final audit narrative from cited evidence.
5. Run report render and strict report lint; do not implement fixes until the review gate passes.
6. Apply only safe_auto_fix items directly in the website source repo when source candidates are clear and validation commands exist.
7. Treat manual_strategy items as normal implementation work that needs source inspection and engineering judgment.
8. Do not make policy, auth, payment, indexing, canonical, crawler or MCP mutation changes without explicit approval.
9. Preserve approval_required items in remaining-user-decisions.md.
10. Re-run scan, report lint, validation, benchmark, plan build, project tests, build and security checks.
11. Commit and push only after the verification gates pass.
12. Summarize final score, changed files, remaining user decisions and verification results.
```

Recommended scan command:

```bash
pnpm --filter @seo-polish/cli seo-polish scan https://your-site.com \
  --repo . \
  --output ./seo-polish-report \
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

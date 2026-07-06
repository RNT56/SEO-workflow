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
- `seo-polish-report/findings.json`
- `seo-polish-report/remediation-plan.json`
- `seo-polish-report/priority-action-plan.md`
- `seo-polish-report/patch.diff`
- `seo-polish-report/manual-actions.md`
- `seo-polish-report/remaining-user-decisions.md`
- `seo-polish-report/validation.json`
- `seo-polish-report/standards-registry.json`
- `seo-polish-report/agent-instructions/`

No evidence means no finding, and no approval means no sensitive policy change.

## Execution sequence

Use this sequence inside the website source repository:

```text
Use /path/to/SEO-workflow as the SEO audit and remediation workflow.

Target live site: https://your-site.com
Website source repo: current workspace

Run the workflow end to end:
1. Build the SEO workflow if needed.
2. Scan the live site into ./seo-polish-report.
3. Read agent-execution-plan.md first, then findings.json, remediation-plan.json, priority-action-plan.md, patch.diff, manual-actions.md, remaining-user-decisions.md, validation.json and benchmark.json if present.
4. Apply only safe_auto_fix items directly in the website source repo.
5. Do not make policy, auth, payment, indexing, canonical, crawler or MCP mutation changes without explicit approval.
6. Preserve approval_required items in remaining-user-decisions.md.
7. Re-run scan, report lint, validation, benchmark, plan build, project tests, build and security checks.
8. Commit and push only after the verification gates pass.
9. Summarize final score, changed files, remaining user decisions and verification results.
```

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
pnpm security
```

For the target website repository, run that project's own lint, typecheck, test, build and security gates in addition to a fresh SEO polish scan and strict report lint.

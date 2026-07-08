# seo-polish-website

Use this skill when scanning, reporting, validating or improving a website for SEO polish workflow coverage.

## Required behavior

1. Run quietly by default. Message the user only for approvals, blockers, safety boundaries, long-running delays, failed gates and final completion.
2. Put detailed evidence, logs, plans and reasoning into report artifacts instead of chat.
3. Run the workflow through `seo-polish scan <url> --audit-root ./audit-reports`; add `--repo <path>` when the website source repository is available.
4. Use the generated structured files as the source of truth.
5. Do not create a freeform-only audit report.
6. Do not emit a finding without evidence.
7. Do not publish policy, auth, payment, crawler, index/noindex, ambiguous canonical or mutating MCP changes without explicit approval.
8. Build the final handoff with `seo-polish plan build --report <audit-run-dir>`.
9. Validate with `seo-polish report lint <audit-run-dir> --strict`.
10. Complete the final workflow retrospective before declaring the workflow run complete.
11. Export shareable packages with `seo-polish export --report <audit-run-dir> --profile review|repo-import|full`.
12. Export maintainer-only learnings with `seo-polish learnings collect --report <audit-run-dir>` only when requested.

## Required outputs

The audit run directory must contain:

- `index.md`
- `index.html`
- `findings.json`
- `score.json`
- `evidence.jsonl`
- `remediation-plan.json`
- `validation.json`
- `tech-stack.json`
- `repo-analysis.json`
- `route-templates.json`
- `performance-audit.json`
- `resource-timing.json`
- `actionability.json`
- `baseline-comparison.json`
- `suppression-report.json`
- `quality-gate.json`
- `priority-action-plan.md`
- `agent-execution-plan.md`
- `workflow-retrospective-input.json`
- `workflow-retrospective.json`
- `workflow-retrospective.md`
- `workflow-completion.json`
- `workflow-learnings/maintainer-actions.json`
- `standards-registry.json`
- `agent-instructions/codex.md`
- `audit-run.json`
- `exports/<profile>.zip`

## References

- `references/report-contract.md`
- `references/safety-rules.md`
- `references/remediation-rules.md`
- `references/seo-rules.md`
- `references/agent-readiness-rules.md`

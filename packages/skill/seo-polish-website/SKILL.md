# seo-polish-website

Use this skill when scanning, reporting, validating or improving a website for SEO polish workflow coverage.

## Required behavior

1. Run quietly by default. Message the user only for approvals, blockers, safety boundaries, long-running delays, failed gates and final completion.
2. Put detailed evidence, logs, plans and reasoning into report artifacts instead of chat.
3. Run the workflow through `seo-polish scan <url> --output ./seo-polish-report`; add `--repo <path>` when the website source repository is available.
4. Use the generated structured files as the source of truth.
5. Do not create a freeform-only audit report.
6. Do not emit a finding without evidence.
7. Do not publish policy, auth, payment, crawler, index/noindex, ambiguous canonical or mutating MCP changes without explicit approval.
8. Build the final handoff with `seo-polish plan build --report ./seo-polish-report`.
9. Validate with `seo-polish report lint ./seo-polish-report --strict`.

## Required outputs

- `seo-polish-report/index.md`
- `seo-polish-report/index.html`
- `seo-polish-report/findings.json`
- `seo-polish-report/score.json`
- `seo-polish-report/evidence.jsonl`
- `seo-polish-report/remediation-plan.json`
- `seo-polish-report/validation.json`
- `seo-polish-report/tech-stack.json`
- `seo-polish-report/repo-analysis.json`
- `seo-polish-report/route-templates.json`
- `seo-polish-report/performance-audit.json`
- `seo-polish-report/resource-timing.json`
- `seo-polish-report/actionability.json`
- `seo-polish-report/baseline-comparison.json`
- `seo-polish-report/suppression-report.json`
- `seo-polish-report/quality-gate.json`
- `seo-polish-report/priority-action-plan.md`
- `seo-polish-report/agent-execution-plan.md`
- `seo-polish-report/standards-registry.json`
- `seo-polish-report/agent-instructions/codex.md`

## References

- `references/report-contract.md`
- `references/safety-rules.md`
- `references/remediation-rules.md`
- `references/seo-rules.md`
- `references/agent-readiness-rules.md`

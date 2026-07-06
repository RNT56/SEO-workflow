# seo-polish-website

Use this skill when scanning, reporting, validating or improving a website for SEO polish workflow coverage.

## Required behavior

1. Run the workflow through `seo-polish scan <url> --output ./seo-polish-report`.
2. Use the generated structured files as the source of truth.
3. Do not create a freeform-only audit report.
4. Do not emit a finding without evidence.
5. Do not publish policy, auth, payment, crawler, index/noindex, ambiguous canonical or mutating MCP changes without explicit approval.
6. Validate with `seo-polish report lint ./seo-polish-report --strict`.

## Required outputs

- `seo-polish-report/index.md`
- `seo-polish-report/index.html`
- `seo-polish-report/findings.json`
- `seo-polish-report/score.json`
- `seo-polish-report/evidence.jsonl`
- `seo-polish-report/remediation-plan.json`
- `seo-polish-report/validation.json`

## References

- `references/report-contract.md`
- `references/safety-rules.md`
- `references/remediation-rules.md`
- `references/seo-rules.md`
- `references/agent-readiness-rules.md`

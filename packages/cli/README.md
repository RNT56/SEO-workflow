# @seo-polish/cli

Provides the `seo-polish` CLI.

Core commands:

- `seo-polish scan <url>`
- `seo-polish plan`
- `seo-polish plan build`
- `seo-polish apply --mode diff-only`
- `seo-polish validate`
- `seo-polish report lint`
- `seo-polish report render`
- `seo-polish policy init`
- `seo-polish standards update`
- `seo-polish benchmark`
- `seo-polish doctor`

`standards update` writes a local standards snapshot and validates rule-to-standard coverage.
`plan build` writes `agent-execution-plan.md`, the final human/agent handoff plan for repo remediation.
`doctor` reports runtime, safety defaults and standards registry health.

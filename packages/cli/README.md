# @seo-polish/cli

Provides the `seo-polish` CLI.

Licensed under the Apache License, Version 2.0.

Run without installing globally:

```bash
pnpm dlx @seo-polish/cli seo-polish scan https://example.com --audit-name "Example"
pnpm dlx @seo-polish/cli seo-polish report lint ./audit-reports/example/<run> --strict
pnpm dlx @seo-polish/cli seo-polish plan build --report ./audit-reports/example/<run>
```

Core commands:

- `seo-polish init`
- `seo-polish run`
- `seo-polish status`
- `seo-polish resume`
- `seo-polish approve|reject|defer`
- `seo-polish review import`
- `seo-polish retrospective import`
- `seo-polish verify`
- `seo-polish compare`
- `seo-polish monitor`
- `seo-polish open`
- `seo-polish scan <url>`
- `seo-polish plan`
- `seo-polish plan build`
- `seo-polish apply --mode diff-only`
- `seo-polish validate`
- `seo-polish report lint`
- `seo-polish report render`
- `seo-polish workflow-retrospective fixture`
- `seo-polish learnings validate`
- `seo-polish learnings collect`
- `seo-polish policy init`
- `seo-polish standards update`
- `seo-polish benchmark`
- `seo-polish export`
- `seo-polish doctor`

`standards update` writes a local standards snapshot and validates rule-to-standard coverage.
`plan build` writes `agent-execution-plan.md`, the final human/agent handoff plan for repo remediation.
Scans without `--output` are stored under `audit-reports/<site>/<timestamp>-<scanId>/`.
`export` creates portable `review`, `repo-import`, `full` or maintainer-only `learnings` packages with
a manifest, checksums and license notice. Zip is the default format.
`learnings collect` writes redacted maintainer retrospective packages under `workflow-learnings/inbox/`
by default.
Generated agent handoffs include a quiet communication contract: agents should avoid routine narration,
write detail into report artifacts, and message users only for approvals, blockers, safety boundaries,
long-running delays, failed gates and completion.
`doctor` reports runtime, safety defaults and standards registry health.

The guided commands persist projects, phases, events, reviews and owner decisions. `open` serves a local-only control
center on a loopback host; it requires same-origin JSON to record decisions and cannot apply repository changes. Full
remediation requires a fresh scan of a deployed verification URL before it can complete.

When invoked through package managers such as `pnpm --filter`, relative paths are resolved from the
directory where the user launched the command, not from the CLI package directory.

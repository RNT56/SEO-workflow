# Playground

The local scan playground is now delivered as the SEO Polish Control Center through the CLI.

The playground should stay a thin UI over the same workflow contract used by the CLI:

1. Accept a URL and safe scan options.
2. Run `seo-polish scan`.
3. Display `index.html`, `findings.json`, `score.json`, `remediation-plan.json`, and `validation.json`.
4. Never invent findings outside the structured report files.
5. Keep apply behavior diff-only unless the user explicitly approves a safe fix.

Start it against an audit root:

```bash
pnpm build
pnpm seo-polish open ./audit-reports
```

The local-only surface lists targets and audit runs, separates core and experimental scores, shows measured-rule
coverage, renders workflow phases, exposes the approval inbox and links to the complete static report. Decision
actions update the report's durable workflow state; they do not apply repository changes.

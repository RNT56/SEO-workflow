# Playground

This directory is reserved for a local scan playground.

The playground should stay a thin UI over the same workflow contract used by the CLI:

1. Accept a URL and safe scan options.
2. Run `seo-polish scan`.
3. Display `index.html`, `findings.json`, `score.json`, `remediation-plan.json`, and `validation.json`.
4. Never invent findings outside the structured report files.
5. Keep apply behavior diff-only unless the user explicitly approves a safe fix.

For now, use the CLI directly:

```bash
pnpm build
node packages/cli/dist/index.js scan https://example.com --output ./seo-polish-report
node packages/cli/dist/index.js report lint ./seo-polish-report --strict
```

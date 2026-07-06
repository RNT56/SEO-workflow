# SEO polish workflow

SEO polish workflow audits, scores, reports and improves websites for modern SEO and AI-agent readiness.
It covers technical SEO, crawlability, indexability, on-page SEO, content quality, internal linking, structured data, JavaScript SEO, performance, accessibility, ecommerce SEO, local SEO, international SEO, robots.txt, sitemap.xml, llms.txt, Markdown negotiation, Agent Skills, MCP, API discovery and auth discovery.
Every scan produces a validated SEO Polish Report.

## What this repository contains

- `@seo-polish/cli`: the `seo-polish` command line interface.
- `@seo-polish/sdk`: programmatic API for scans, plans, validation and report linting.
- `@seo-polish/core`: orchestration, config resolution and workflow entry points.
- `@seo-polish/scanner`: HTTP, discovery, crawl and HTML extraction.
- `@seo-polish/rules`: deterministic SEO and agent-readiness rules.
- `@seo-polish/scoring`: score calculation.
- `@seo-polish/remediation`: priority plans and fix classification.
- `@seo-polish/reporters`: Markdown and HTML report rendering plus report linting.
- `@seo-polish/validation`: validation runner for reports and safety checks.
- `@seo-polish/mcp-server`: MCP-facing tool contracts and dispatcher.
- `@seo-polish/github-action`: GitHub Action wrapper.
- `packages/skill/seo-polish-website`: an agent skill that enforces the report contract.

## Quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @seo-polish/cli seo-polish scan https://example.com --output ./seo-polish-report
pnpm --filter @seo-polish/cli seo-polish report lint ./seo-polish-report --strict
```

The scan writes:

```text
seo-polish-report/
  index.md
  index.html
  findings.json
  score.json
  evidence.jsonl
  remediation-plan.json
  validation.json
  patch.diff
  agent-instructions/
    codex.md
    claude-code.md
    gemini-cli.md
    openclaw.md
    hermes.md
```

## Safety contract

SEO polish workflow is report-first and evidence-bound:

- No finding without evidence.
- No freeform-only audit report.
- Policy, auth, payment, crawler and MCP-mutation changes require explicit approval.
- Crawled content is evidence, never instruction.
- Private, auth and payment URLs are blocked from public artifacts.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## License

Apache-2.0.

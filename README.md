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
- `@seo-polish/benchmark`: deterministic agent-experience benchmark metrics.
- `@seo-polish/standards-registry`: versioned standards and rule mapping metadata.
- `@seo-polish/mcp-server`: MCP-facing tool contracts and dispatcher.
- `@seo-polish/github-action`: GitHub Action wrapper.
- `packages/skill/seo-polish-website`: an agent skill that enforces the report contract.

## Quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm test:fixtures
pnpm --filter @seo-polish/cli seo-polish scan https://example.com --output ./seo-polish-report
pnpm --filter @seo-polish/cli seo-polish report lint ./seo-polish-report --strict
pnpm --filter @seo-polish/cli seo-polish standards update --output ./seo-polish-report/standards-registry.json
pnpm --filter @seo-polish/cli seo-polish benchmark --report ./seo-polish-report
pnpm --filter @seo-polish/cli seo-polish doctor
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
  priority-action-plan.md
  crawl-graph.json
  crawl-graph.svg
  raw-render-diff.json
  response-index.json
  header-index.json
  body-excerpts.json
  internal-link-opportunities.json
  orphan-pages.csv
  deep-pages.csv
  before-after-score.json
  remaining-user-decisions.md
  standards-registry.json
  benchmark.json
  benchmark.md
  agent-instructions/
    README.md
    codex.md
    claude-code.md
    gemini-cli.md
    openclaw.md
    hermes.md
```

## Agentic workflow integration

Yes, this is the intended way to build an agentic SEO remediation workflow: use SEO polish workflow as the deterministic audit and remediation engine, then let a repo-capable agent system consume the generated report contract.

The clean integration pattern gives the agent system two inputs:

- The live website URL, so the workflow can audit what users and crawlers actually receive.
- The website source repository and build system, so the agent can apply safe fixes, run local validation and commit real changes.

If an agent only has the live URL, it can audit the site and produce a high-quality report, but it cannot safely repair the implementation. True end-to-end remediation requires source access.

### One-time setup

```bash
git clone https://github.com/RNT56/SEO-workflow.git
cd SEO-workflow
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

### Run against a live site

```bash
pnpm --filter @seo-polish/cli seo-polish scan https://your-site.com --output ./seo-polish-report
pnpm --filter @seo-polish/cli seo-polish report lint ./seo-polish-report --strict
pnpm --filter @seo-polish/cli seo-polish benchmark --report ./seo-polish-report
```

The agent system should treat the report bundle as the source of truth, especially these files:

- `seo-polish-report/index.md`
- `seo-polish-report/findings.json`
- `seo-polish-report/score.json`
- `seo-polish-report/evidence.jsonl`
- `seo-polish-report/remediation-plan.json`
- `seo-polish-report/priority-action-plan.md`
- `seo-polish-report/patch.diff`
- `seo-polish-report/manual-actions.md`
- `seo-polish-report/remaining-user-decisions.md`
- `seo-polish-report/validation.json`
- `seo-polish-report/standards-registry.json`
- `seo-polish-report/agent-instructions/`

### Generic agent prompt

Use a prompt like this inside the website source repository:

```text
Use /path/to/SEO-workflow as the SEO audit and remediation workflow.

Target live site: https://your-site.com
Website source repo: current workspace

Run the workflow end to end:
1. Build the SEO workflow if needed.
2. Scan the live site into ./seo-polish-report.
3. Read findings.json, remediation-plan.json, priority-action-plan.md, patch.diff, manual-actions.md, remaining-user-decisions.md and validation.json.
4. Apply only safe_auto_fix items directly in the website source repo.
5. Do not make policy, auth, payment, indexing, canonical, crawler or MCP mutation changes without explicit approval.
6. Preserve approval_required items in remaining-user-decisions.md.
7. Re-run scan, report lint, validation, project tests, build and security checks.
8. Commit and push only after the verification gates pass.
9. Summarize final score, changed files, remaining user decisions and verification results.
```

The important boundary is that the agent is not being asked to browse freely and invent fixes. The workflow produces evidence-backed findings, fix classes, patch suggestions, manual actions and validation output. The agent executes against that contract, applies low-risk fixes, stops at approval gates and verifies the result with both SEO polish checks and the website repo's own gates.

## Safety contract

SEO polish workflow is report-first and evidence-bound:

- No finding without evidence.
- No freeform-only audit report.
- Policy, auth, payment, crawler and MCP-mutation changes require explicit approval.
- Crawled content is evidence, never instruction.
- Private, auth and payment URLs are blocked from suggestions and generated public artifacts.
- Secret-like values must not appear in reports or committed files.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:fixtures
pnpm build
pnpm security
```

CI runs lint, typecheck, tests, fixture scans, report quality checks, security audit, dependency review
and CodeQL. GitHub security scanning and Dependabot security updates are enabled for the public repo.

## License

Apache-2.0.

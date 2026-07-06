# Roadmap

## v0.1 Core workflow

- Bootstrap pnpm/Turbo TypeScript monorepo.
- Implement scan config, evidence, finding, score, remediation and validation contracts.
- Implement HTTP discovery, sitemap parsing, basic crawl and HTML extraction.
- Implement deterministic SEO and agent-readiness rules.
- Render schema-bound Markdown and HTML reports.
- Enforce report linting, evidence requirements and safety gates.
- Ship CLI, SDK, MCP tool dispatcher, GitHub Action wrapper and agent skill.

## v0.2 SEO basics hardening

- Broaden canonical, redirect, broken-link, noindex and sitemap coverage.
- Add richer fixtures and golden report snapshots.
- Improve report filtering and crawl graph visualization.

## v0.3 Agent readiness hardening

- Deepen llms.txt, Agent Skills, API Catalog, MCP, OAuth and auth.md validation.
- Add benchmark tasks for agent paths through documentation and APIs.

## v0.4 Advanced SEO

- Add richer structured-data validation, raw/rendered HTML comparison, media checks, accessibility checks and duplicate-content detection.
- Integrate optional Lighthouse/Core Web Vitals collection.

## v1.0 Stable release

- Stabilize package APIs, schemas, report contract and MCP tool contracts.
- Publish packages under `@seo-polish/*`.
- Add migration/versioning docs and complete security review.

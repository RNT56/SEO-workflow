# Docs app

This directory is reserved for the hosted documentation surface for SEO polish workflow.

The package architecture is intentionally usable without a docs server first: the CLI, SDK, MCP dispatcher,
GitHub Action wrapper, report contract, fixture scans and agent skill all live in packages and are tested from
the monorepo. A future docs app should publish:

- Quickstart and CLI guide
- MCP guide and tool contracts
- Agent skill guide
- GitHub Action setup
- Rule authoring guide
- Report contract
- Security model
- Framework adapter guides

Until a web docs framework is added, the canonical documentation is the root `README.md`, package READMEs,
`AGENTS.md`, `SECURITY.md`, and `packages/skill/seo-polish-website/references/`.

# Changelog

## 0.1.0

- Initial monorepo implementation.
- Added CLI, SDK, core workflow, scanner, rules, scoring, remediation, reporting, validation, MCP dispatcher, GitHub Action wrapper and agent skill.
- Added security automation, dependency review, CodeQL, Dependabot and local secret scanning.
- Added safer bounded HTML/sitemap/prompt-control parsing.
- Added broader deterministic rules for headers, duplicate metadata/content, internal linking, local, commerce, protocol and auth discovery.
- Added fixture scan runner, expanded report artifacts, crawl graph output and agent-experience benchmark output.
- Added full standards registry coverage, registry validation, standards snapshot export and richer CLI doctor diagnostics.
- Added priority action plan sidecar output and target-aware agent instruction files.
- Added final agent execution plan output and `seo-polish plan build` handoff generation.
- Added `report-dashboard.json` and the static execution cockpit report UI with implementation queues, impact/effort matrix, template heatmap, performance summaries, baseline comparison and evidence drawers.
- Added optional browser evidence collection with rendered DOM comparison, console/network/runtime markers and browser lab metrics.
- Added optional field-data collection for CrUX, Search Console and first-party RUM, with field metrics prioritized over lab evidence.
- Added trustworthy primary scoring with stable, emerging and experimental profiles plus a per-rule applicability and measurement ledger.
- Added durable quick-audit, full-remediation, PR-regression and monitor workflows with owner decisions, resumable phases, deployed verification and retrospective gates.
- Added path-confined, hash-checked framework remediation adapters and a hardened loopback-only local control center.
- Replaced the MCP placeholder transport with the official protocol SDK and added normalized Search Console, CrUX, metric-file and approval-gated IndexNow integrations.
- Added stable finding comparisons, GitHub regression gates, scheduled monitoring, portfolio aggregation and 77 implemented rule evaluators.
- Added Apache-2.0-licensed package release preparation for `@seo-polish/cli` and its runtime package set.
- Kept `@seo-polish/sdk` private and excluded from the npm release set.

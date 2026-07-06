# @seo-polish/reporters

Renders SEO Polish Reports and enforces the report contract through a strict linter.

Rendered bundles include the Markdown/HTML report, structured JSON files, executive summary,
priority action plan, final agent execution plan, PR comment and target-aware agent instruction files.

The report contract includes production intelligence artifacts such as `tech-stack.json`,
`repo-analysis.json`, `route-templates.json`, `performance-audit.json`, `resource-timing.json`,
`actionability.json`, `baseline-comparison.json`, `suppression-report.json` and `quality-gate.json`.
Report UI controls are static-file safe and must keep filters, copy buttons and section anchors working.

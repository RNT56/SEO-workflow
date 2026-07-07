# @seo-polish/reporters

Renders SEO Polish Reports and enforces the report contract through a strict linter.

Rendered bundles include the Markdown/HTML report, structured JSON files, executive summary,
priority action plan, final agent execution plan, PR comment and target-aware agent instruction files.

The report contract includes production intelligence artifacts such as `report-dashboard.json`,
`tech-stack.json`, `browser-evidence.json`, `field-data.json`, `crux-history.json`, `search-console.json`,
`url-inspection.json`, `rum-vitals.json`, `repo-analysis.json`, `route-templates.json`,
`performance-audit.json`, `resource-timing.json`, `actionability.json`, `baseline-comparison.json`,
`suppression-report.json` and `quality-gate.json`.

`report-dashboard.json` is the stable execution cockpit model. It drives the HTML views for overview,
implementation queue, impact/effort matrix, route template heatmap, performance summaries, baseline
comparison and evidence drawers. Report UI controls are static-file safe and must keep tabs, filters,
copy buttons and section anchors working under `file://`.

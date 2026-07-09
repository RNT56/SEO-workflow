# Report Contract

SEO Polish Workflow writes one complete audit run directory per scan. The report is not freeform-only:
human-readable files, machine-readable artifacts, evidence, validation and export metadata are generated
together so the audit can be reviewed, reproduced and handed off safely.

## Core artifacts

Every audit run should include these core files:

| File                         | Purpose                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` and `index.md`  | Static human-readable report                                                                                                      |
| `findings.json`              | Evidence-backed findings with impact, root cause, affected URLs, recommended fix, validation steps, confidence and approval flags |
| `score.json`                 | SEO and readiness scoring output                                                                                                  |
| `evidence.jsonl`             | Raw evidence records used by findings                                                                                             |
| `remediation-plan.json`      | Structured remediation phases and fix classifications                                                                             |
| `validation.json`            | Report lint, signal-quality and safety validation results                                                                         |
| `quality-gate.json`          | Final report production gate status                                                                                               |
| `production-readiness.json`  | Production-readiness mirror of the quality gate                                                                                   |
| `report-dashboard.json`      | Stable dashboard model for the HTML report and implementation queue                                                               |
| `rule-evaluations.json`      | Applicability, maturity, measured/not-measured state and result for every catalogued rule                                         |
| `workflow-state.json`        | Durable mode, phase, status, stop-reason and resume state for guided workflow runs                                                |
| `workflow-events.jsonl`      | Append-only phase, decision and artifact event ledger                                                                             |
| `workflow-project.json`      | Portable project and target snapshot used to resume the run                                                                       |
| `decisions.json`             | Owner approval inbox and recorded approve/reject/defer dispositions                                                               |
| `verification-manifest.json` | Report and optional repository gate results for the completed run                                                                 |
| `change-set.json`            | Framework-adapter plan with hashes, approvals, applied changes and failures                                                       |
| `change-set.diff`            | Human-reviewable bounded adapter change proposal                                                                                  |
| `audit-run.json`             | Storage metadata for the audit run folder, export profiles and privacy defaults                                                   |
| `patch.diff`                 | Diff-only patch proposal where safe automation is possible                                                                        |
| `priority-action-plan.md`    | Ordered remediation summary                                                                                                       |
| `agent-execution-plan.md`    | Source-repo handoff plan for repo-capable agents or human implementers                                                            |
| `standards-registry.json`    | Local standards snapshot and rule mapping metadata                                                                                |
| `agent-instructions/*.md`    | Environment-specific execution guidance generated from the report                                                                 |

## Review artifacts

Agent-assisted audits add a structured review layer on top of deterministic evidence:

| File                        | Purpose                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `agent-review-input.json`   | Bounded deterministic evidence packet for review and narrative writing                                       |
| `agent-review.json`         | Structured agent-authored strategic review                                                                   |
| `search-intent-review.json` | Page/query intent, topical coverage and content-gap review                                                   |
| `agent-skills-review.json`  | Review of whether AI agents can understand, navigate and safely act on the site                              |
| `copy-recommendations.json` | Evidence-linked title, meta, heading, CTA, alt text, rewrite and content-brief proposals with approval gates |
| `copy-recommendations.md`   | Human-readable copy recommendation summary                                                                   |
| `executive-summary.md`      | Plain-language executive summary                                                                             |
| `final-audit.md`            | Final audit narrative                                                                                        |

Strict report lint and production readiness stay failed until completed review artifacts are evidence-linked.

## Maintainer retrospective artifacts

Workflow-learning artifacts are private by default and are not included in stakeholder review exports:

| File                                         | Purpose                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `workflow-retrospective-input.json`          | Bounded evidence packet for workflow-learning review                                        |
| `workflow-retrospective.json`                | Structured maintainer-facing retrospective                                                  |
| `workflow-retrospective.md`                  | Human-readable retrospective summary                                                        |
| `workflow-completion.json`                   | Final workflow completion gate                                                              |
| `workflow-learnings/rule-gaps.json`          | Proposed rule coverage improvements                                                         |
| `workflow-learnings/report-ux-gaps.json`     | Proposed report UI and report clarity improvements                                          |
| `workflow-learnings/agent-friction.json`     | Agent execution friction and blocker notes                                                  |
| `workflow-learnings/maintainer-actions.json` | Proposed maintainer actions with `proposed`, `accepted`, `rejected` or `implemented` status |

Retrospectives can propose workflow improvements, but they must not auto-mutate workflow rules, schemas,
docs, tests or source code.

## Site intelligence artifacts

These files deepen the audit when browser, field-data, baseline or repo-aware inputs are available:

| File                       | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `crawl-graph.json`         | Crawl relationship data                                                                        |
| `raw-render-diff.json`     | Raw comparison data for fetch and rendered output                                              |
| `browser-evidence.json`    | Rendered DOM, console errors, failed requests, stack markers, resource timing and lab evidence |
| `field-data.json`          | Unified CrUX, Search Console and RUM summary                                                   |
| `crux-history.json`        | Optional CrUX historical p75 trend points                                                      |
| `search-console.json`      | Owner-authorized Search Console Search Analytics summary                                       |
| `url-inspection.json`      | Bounded URL Inspection results for sampled crawled URLs                                        |
| `rum-vitals.json`          | First-party Web Vitals export normalized to p75 metrics                                        |
| `tech-stack.json`          | Framework, hosting, CDN, CMS, analytics, bundler and rendering signals                         |
| `repo-analysis.json`       | Source repo framework, route, metadata, deployment and SEO file candidates                     |
| `route-templates.json`     | Crawled URL clusters by route/template shape                                                   |
| `performance-audit.json`   | Budgeted performance metrics, repeated HTTP timing and browser-metric limitations              |
| `resource-timing.json`     | Statically discovered resource inventory with blocking and third-party signals                 |
| `actionability.json`       | Owner, automation readiness, blockers, next step and source candidates for each finding        |
| `baseline-comparison.json` | Score, finding and performance deltas against a configured previous report                     |
| `suppression-report.json`  | Non-destructive ledger for intentional exceptions                                              |

## Finding requirements

Every finding must include:

- ID
- title
- severity
- category
- confidence
- affected URLs or templates
- safe-to-auto-fix flag
- approval-required flag
- actionability owner
- automation readiness
- source candidates or explicit source blocker
- evidence
- impact
- root cause
- recommended fix
- validation steps

No evidence means no finding.

## Export profiles

Portable packages are generated with `seo-polish export`:

| Profile       | Contents                                                       |
| ------------- | -------------------------------------------------------------- |
| `review`      | Stakeholder-readable report artifacts                          |
| `repo-import` | Implementation handoff files for a repo-capable agent or human |
| `full`        | Complete internal audit package                                |
| `learnings`   | Redacted maintainer-only workflow-learning package             |

Every export includes `export-manifest.json`, `checksums.sha256` and `LICENSE-NOTICE.md`.

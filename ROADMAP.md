# Roadmap and Capability Status

The implementation state is tracked by capability rather than by aspirational version buckets. A capability is
`complete` only when its contract, implementation, tests, user documentation and release verification exist.

## Current capability matrix

| Capability                                                 | State    | Evidence                                                                               |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| Evidence-first live scan and report contract               | Complete | CLI scan, schema-bound artifacts, report lint, fixture scans                           |
| Stable vs experimental scoring                             | Complete | Core SEO primary grade, separate experimental composite, coverage ledger               |
| Rule applicability and measurement coverage                | Complete | `rule-evaluations.json` records pass/fail/not-applicable/not-measured                  |
| Redirect, international, local, commerce and LCP hardening | Complete | All catalogued rules have deterministic evaluators and direct tests                    |
| Guided project workflow                                    | Complete | `init`, `run`, `status`, `resume`, durable phases and append-only events               |
| Owner decision workflow                                    | Complete | Decision inbox, approve/reject/defer CLI and local control-center actions              |
| Framework-aware bounded remediation                        | Complete | Static, Next.js, Astro, Nuxt, SvelteKit, Remix, Docusaurus and generic detection       |
| Change-set safety                                          | Complete | Repository confinement, symlink guards, content hashes and sensitive approvals         |
| Post-change verification                                   | Complete | Deployed verification URL, fresh scan, baseline comparison and final review gate       |
| Workflow retrospective                                     | Complete | Import, rerender and completion gating after final verification                        |
| Local control center                                       | Complete | `seo-polish open`, project/run view, phases, scores, coverage, decisions and findings  |
| MCP interoperability                                       | Complete | Official SDK, lifecycle negotiation, tool schemas, resources and in-memory client test |
| Search/field data providers                                | Complete | Search Console, CrUX, metric-file normalization and approval-gated IndexNow            |
| Search opportunity prioritization                          | Complete | Search Console metrics enrich queue priority without creating findings                 |
| PR regression workflow                                     | Complete | Baseline comparison, score-drop/new-high gates, outputs and step summary               |
| Continuous monitoring                                      | Complete | Monitor mode, portfolio aggregation and scheduled GitHub workflow                      |
| Package/export release surface                             | Complete | Release set, packed artifact validation and portable report exports                    |

## Next maturity milestones

### Stable 1.0 contract

- Accumulate compatibility evidence from diverse live sites and repositories.
- Freeze schema and MCP tool contracts after the pre-1.0 feedback window.
- Publish migration notes for every breaking contract revision.
- Complete an independent security and false-positive review.

### Optional hosted operations

- Add a hosted runner only if local-first projects demonstrate a real coordination need.
- Preserve origin guards, report-only defaults, credential isolation and explicit mutation approvals.
- Keep the local CLI, static reports and control center fully usable without an account or cloud service.

### Additional adapters and providers

- Add framework adapters only with golden repositories and end-to-end verification fixtures.
- Add analytics providers through the normalized metric contract; imported data may prioritize but never invent findings.
- Track experimental agent-discovery conventions independently from established SEO standards.

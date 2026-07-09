# Web app

This directory remains reserved for an optional hosted scan API. The interactive dashboard is already available
locally through `seo-polish open`, so a hosted service is not required for the complete product workflow.

Hosted scanning is not required for the first stable workflow. If added, it must preserve the same safety
boundaries as the CLI:

- report-only default mode
- origin guard and private URL guard
- no authenticated crawling by default
- no policy/auth/payment/MCP mutation changes without explicit approval
- no stored sensitive evidence
- schema-validated reports only

The current production path is local-first: CLI, SDK, MCP dispatcher, GitHub Action wrapper and fixture scans.

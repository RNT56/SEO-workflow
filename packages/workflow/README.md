# @seo-polish/workflow

Durable project, run, phase, decision and verification orchestration for the guided SEO Polish workflow.

It writes explicit state and append-only events, supports pause/resume behavior, and keeps URL-only audits distinct
from production-ready remediation runs.

The four modes are `quick-audit`, `full-remediation`, `pr-regression` and `monitor`. Full remediation cannot complete
without an evidence-linked review, relevant owner decisions, approved bounded changes, a fresh deployed verification
scan, a final review and a maintainer retrospective. The package also compares stable finding identities across runs
and builds portfolio summaries from an audit root.

Non-commercial only. This package is distributed under the SEO Polish Non-Commercial License v1.0.

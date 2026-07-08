# Workflow Learnings

This folder is the maintainer intake point for private workflow-retrospective packages.

Use:

```bash
seo-polish learnings collect --report <audit-run-dir> --output ./workflow-learnings/inbox
```

Collected packages are written under `workflow-learnings/inbox/`, which is intentionally ignored.
Review them manually, redact customer-specific context, then promote only generalized improvements into
tracked issues, docs, fixtures, rules, schemas or tests.

Agents must not auto-mutate the workflow from a single retrospective. Maintainer actions are proposals
until a maintainer accepts them.

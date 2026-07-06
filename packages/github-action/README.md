# @seo-polish/github-action

Action wrapper for running SEO polish scans in pull requests and release checks.

```yaml
name: SEO Polish Check
on:
  pull_request:
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 11.10.0
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: ./packages/github-action
        with:
          url: "http://localhost:3000"
          output: "seo-polish-report"
          max-pages: "300"
          fail-on-critical: "true"
          fail-on-report-lint: "true"
          fail-on-private-url: "true"
      - uses: actions/upload-artifact@v4
        with:
          name: seo-polish-report
          path: seo-polish-report/
```

The action writes `report-path`, `score`, `critical-findings` and `github-pr-comment` outputs.

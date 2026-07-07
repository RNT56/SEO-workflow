# @seo-polish/scanner

Fetches public website resources, discovers crawl inputs, extracts SEO metadata and writes evidence-ready scan snapshots.

The default scanner is HTTP-first: headers, raw HTML, discovery endpoints, sitemap/robots/llms probes,
resource discovery and repeated fetch timings. This keeps normal scans fast and deterministic.

When the CLI is run with `--browser-evidence` or `--core-web-vitals`, the scanner also performs a
bounded Playwright browser pass over sampled crawled pages. That pass writes `browser-evidence.json`
and captures:

- browser-rendered title, description, canonical, H1, link count and JSON-LD types
- raw-vs-rendered changed fields for JavaScript SEO review
- console errors, page errors and failed requests
- runtime framework/bundler markers such as SvelteKit, Next.js, Astro, Nuxt and Vite
- browser resource timing entries
- lab metrics where available: TTFB, FCP, LCP and CLS

INP is intentionally not fabricated. It remains `not_measured` unless scripted interactions or field
data are available.

When the CLI is run with `--field-data`, the scanner can also attach real-user or owner-auth evidence:

- `--field-data crux` queries the Chrome UX Report API with `SEO_POLISH_CRUX_API_KEY`.
- `--field-data gsc --gsc-site <property>` reads Search Console Search Analytics and bounded URL
  Inspection data with `SEO_POLISH_GSC_ACCESS_TOKEN`.
- `--field-data rum --rum-file <path>` normalizes a first-party Web Vitals export into p75 metrics.

Field data is bounded and summarized into `field-data.json`; supporting artifacts include
`crux-history.json`, `search-console.json`, `url-inspection.json` and `rum-vitals.json`. Credential
values are never stored in scan results. Performance metrics prefer first-party RUM, then CrUX field
data, then browser lab samples, then `not_measured`.

Live browser evidence is strong runtime evidence, but the source repo remains authoritative for private
dependencies and exact implementation targets. Use `scan <url> --repo <path> --browser-evidence` for the
best production remediation input.

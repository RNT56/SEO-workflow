import type { Finding, ReportBundle } from "@seo-polish/schemas";
import { REPORT_SECTIONS } from "@seo-polish/schemas";

export function renderHtmlReport(bundle: ReportBundle): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SEO Polish Report</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <header class="hero">
    <div>
      <p class="eyebrow">SEO Polish Report</p>
      <h1>${escapeHtml(new URL(bundle.scan.config.url).hostname)}</h1>
      <p>${escapeHtml(bundle.scan.siteType)} site, ${escapeHtml(bundle.scan.framework)} framework signal</p>
    </div>
    <div class="score">${bundle.score.total}<span>/100</span></div>
  </header>
  <main class="layout">
    <nav class="toc" aria-label="Report sections">
      ${REPORT_SECTIONS.map((section) => `<a href="#section-${section.number}">${section.number}. ${escapeHtml(section.title)}</a>`).join("")}
    </nav>
    <article>
      <section class="toolbar" aria-label="Finding filters">
        <button type="button" data-filter="all">All</button>
        <button type="button" data-filter="critical">Critical</button>
        <button type="button" data-filter="high">High</button>
        <button type="button" data-filter="medium">Medium</button>
        <button type="button" data-filter="low">Low</button>
      </section>
      ${renderScoreGrid(bundle)}
      ${REPORT_SECTIONS.map((section) => renderHtmlSection(section.number, section.title, bundle)).join("")}
    </article>
  </main>
  <script>
    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-filter');
        document.querySelectorAll('[data-severity]').forEach((card) => {
          card.style.display = value === 'all' || card.getAttribute('data-severity') === value ? '' : 'none';
        });
      });
    });
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.getAttribute('data-copy'));
        if (target) await navigator.clipboard.writeText(target.textContent || '');
      });
    });
  </script>
</body>
</html>`;
}

function renderScoreGrid(bundle: ReportBundle): string {
  return `<section class="score-grid" aria-label="Score overview">
${bundle.score.categories
  .map(
    (category) => `<div class="metric">
  <span>${escapeHtml(category.label)}</span>
  <strong>${category.score}/${category.maxScore}</strong>
  <small>${escapeHtml(category.status)} - ${escapeHtml(category.notes)}</small>
</div>`
  )
  .join("")}
</section>`;
}

function renderHtmlSection(number: number, title: string, bundle: ReportBundle): string {
  if (number === 1) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>Combined score: <strong>${bundle.score.total}/100</strong> (${escapeHtml(bundle.score.level)}). Findings are evidence-bound and generated from structured scan output.</p></section>`;
  }
  if (number === 3) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${bundle.remediationPlan.phases
      .map(
        (phase) =>
          `<h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.summary)}</p><ul>${phase.items.map((item) => `<li>${escapeHtml(item.findingId)} - ${escapeHtml(item.title)}</li>`).join("") || "<li>No items.</li>"}</ul>`
      )
      .join("")}</section>`;
  }
  if (number === 24) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><ul>${bundle.validation.checks.map((check) => `<li><strong>${escapeHtml(check.status)}</strong> ${escapeHtml(check.title)} - ${escapeHtml(check.message)}</li>`).join("")}</ul></section>`;
  }
  if (number === 26) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>${bundle.scan.evidence.length} evidence entries, ${bundle.scan.pages.length} crawled pages.</p></section>`;
  }
  if (number === 27) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>The final executable handoff is written to <code>agent-execution-plan.md</code>. Rebuild it after benchmark data with <code>seo-polish plan build --report ${escapeHtml(bundle.scan.config.outputDir)}</code>.</p></section>`;
  }

  const section = REPORT_SECTIONS.find((item) => item.number === number);
  const findings = section
    ? bundle.findings.filter((finding) => section.categories.includes(finding.category))
    : [];
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${findings.length === 0 ? `<p class="status">Status: ${notApplicable(title, bundle.scan.siteType) ? "Not applicable" : "Passed"}</p>` : findings.map(renderFindingHtml).join("")}</section>`;
}

function renderFindingHtml(finding: Finding): string {
  const commandId = `validation-${finding.id}`;
  return `<article class="finding" data-severity="${escapeHtml(finding.severity)}">
  <h3>${escapeHtml(finding.id)} - ${escapeHtml(finding.title)}</h3>
  <div class="meta">
    <span class="badge ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
    <span>${escapeHtml(finding.category)}</span>
    <span>${finding.confidence}% confidence</span>
    <span>Auto-fix: ${finding.safeToAutoFix ? "yes" : "no"}</span>
    <span>Approval: ${finding.approvalRequired ? "yes" : "no"}</span>
  </div>
  <p><strong>Impact:</strong> ${escapeHtml(finding.impact)}</p>
  <p><strong>Root cause:</strong> ${escapeHtml(finding.rootCause)}</p>
  <p><strong>Recommended fix:</strong> ${escapeHtml(finding.recommendation)}</p>
  <details>
    <summary>Evidence</summary>
    <ul>${finding.evidence.map((item) => `<li><code>${escapeHtml(item.url ?? item.path ?? item.id)}</code> ${escapeHtml(String(item.excerpt ?? item.value ?? item.status ?? ""))}</li>`).join("")}</ul>
  </details>
  <pre id="${commandId}"><code>${escapeHtml(finding.validation.join("\n"))}</code></pre>
  <button type="button" data-copy="${commandId}">Copy validation</button>
</article>`;
}

function notApplicable(title: string, siteType: string): boolean {
  return (
    (title.includes("E-Commerce") && siteType !== "commerce") ||
    (title.includes("Local SEO") && siteType !== "local-business") ||
    title.includes("International")
  );
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const REPORT_CSS = `
:root {
  --sp-bg: #0b0f14;
  --sp-surface: #111821;
  --sp-surface-soft: #17202b;
  --sp-text: #eef4ff;
  --sp-muted: #9fb0c3;
  --sp-border: #253244;
  --sp-critical: #ff4d4f;
  --sp-high: #ff8c42;
  --sp-medium: #facc15;
  --sp-low: #38bdf8;
  --sp-info: #a78bfa;
  --sp-pass: #22c55e;
  --sp-radius: 14px;
  --sp-shadow: 0 16px 40px rgba(0,0,0,.25);
  --sp-font: Inter, ui-sans-serif, system-ui, sans-serif;
  --sp-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--sp-bg); color: var(--sp-text); font-family: var(--sp-font); }
.hero { display: flex; justify-content: space-between; gap: 24px; padding: 40px max(24px, 6vw); border-bottom: 1px solid var(--sp-border); background: linear-gradient(180deg, #111821, #0b0f14); }
.hero h1 { margin: 0; font-size: 42px; letter-spacing: 0; }
.eyebrow { color: var(--sp-muted); text-transform: uppercase; font-size: 12px; letter-spacing: .12em; }
.score { min-width: 150px; height: 150px; border: 1px solid var(--sp-border); border-radius: var(--sp-radius); display: grid; place-items: center; font-size: 54px; font-weight: 800; background: var(--sp-surface); box-shadow: var(--sp-shadow); }
.score span { font-size: 18px; color: var(--sp-muted); }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 28px; padding: 28px max(24px, 6vw); }
.toc { position: sticky; top: 20px; align-self: start; display: grid; gap: 8px; max-height: calc(100vh - 40px); overflow: auto; }
.toc a { color: var(--sp-muted); text-decoration: none; border-left: 2px solid var(--sp-border); padding: 4px 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
button { background: var(--sp-surface-soft); border: 1px solid var(--sp-border); color: var(--sp-text); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
section { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--sp-border); }
h2 { margin-top: 0; font-size: 24px; letter-spacing: 0; }
h3 { letter-spacing: 0; }
.score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.metric, .finding { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius); padding: 16px; }
.metric strong { display: block; margin: 8px 0; font-size: 30px; }
.metric small { color: var(--sp-muted); }
.finding { margin: 14px 0; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--sp-muted); }
.badge { border-radius: 999px; padding: 2px 8px; color: #0b0f14; font-weight: 700; }
.critical { background: var(--sp-critical); }
.high { background: var(--sp-high); }
.medium { background: var(--sp-medium); }
.low { background: var(--sp-low); }
.info { background: var(--sp-info); }
pre { overflow: auto; background: #05070a; border: 1px solid var(--sp-border); border-radius: 8px; padding: 12px; }
code { font-family: var(--sp-mono); }
.status { color: var(--sp-pass); }
@media (max-width: 860px) {
  .hero { display: block; }
  .score { margin-top: 20px; }
  .layout { display: block; }
  .toc { position: static; margin-bottom: 20px; }
}
@media print {
  body { background: white; color: black; }
  .toc, .toolbar, button { display: none; }
  .layout { display: block; padding: 0; }
  .metric, .finding { border-color: #ccc; }
}
`;

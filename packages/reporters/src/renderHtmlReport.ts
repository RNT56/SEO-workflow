import type { Finding, ReportBundle } from "@seo-polish/schemas";
import { REPORT_SECTIONS } from "@seo-polish/schemas";
import {
  attentionValidationChecks,
  countBySeverity,
  findingInstanceCounts,
  formatInstanceSuffix,
  formatSet,
  groupFindings,
  uniqueRemediationOptions,
  validationStatusCounts
} from "./reportSignal.js";

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
  ${renderHero(bundle)}
  <main class="layout">
    <nav class="toc" aria-label="Report sections">
      ${REPORT_SECTIONS.map((section) => `<a href="#section-${section.number}">${section.number}. ${escapeHtml(section.title)}</a>`).join("")}
    </nav>
    <article>
      <section class="toolbar" aria-label="Finding filters">
        <button type="button" data-filter="all" aria-pressed="true" class="is-active">All</button>
        <button type="button" data-filter="critical" aria-pressed="false">Critical</button>
        <button type="button" data-filter="high" aria-pressed="false">High</button>
        <button type="button" data-filter="medium" aria-pressed="false">Medium</button>
        <button type="button" data-filter="low" aria-pressed="false">Low</button>
        <button type="button" data-filter="info" aria-pressed="false">Info</button>
      </section>
      ${renderScoreGrid(bundle)}
      ${REPORT_SECTIONS.map((section) => renderHtmlSection(section.number, section.title, bundle)).join("")}
    </article>
  </main>
  <script>
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    const findingCards = Array.from(document.querySelectorAll('[data-severity]'));
    function applyFilter(value) {
      findingCards.forEach((card) => {
        card.hidden = value !== 'all' && card.getAttribute('data-severity') !== value;
      });
      filterButtons.forEach((button) => {
        const active = button.getAttribute('data-filter') === value;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) throw new Error('Copy command failed');
    }
    filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-filter');
        applyFilter(value || 'all');
      });
    });
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.getAttribute('data-copy'));
        const status = button.parentElement ? button.parentElement.querySelector('[data-copy-status]') : null;
        if (!target) return;
        const previousText = button.textContent || 'Copy validation';
        try {
          await copyText(target.textContent || '');
          button.textContent = 'Copied';
          if (status) status.textContent = 'Copied';
        } catch {
          if (status) status.textContent = 'Copy failed';
        } finally {
          window.setTimeout(() => {
            button.textContent = previousText;
            if (status) status.textContent = '';
          }, 1600);
        }
      });
    });
  </script>
</body>
</html>`;
}

function renderScoreGrid(bundle: ReportBundle): string {
  return `<section class="score-overview" aria-label="Score overview">
  <div class="score-grid">
${bundle.score.categories
  .map(
    (category) => `<div class="metric">
  <div class="metric-head">
    ${renderScoreRing(category.score, category.maxScore, category.status, category.label, "small")}
    <div>
      <span>${escapeHtml(category.label)}</span>
      <strong>${category.score}/${category.maxScore}</strong>
    </div>
  </div>
  <small>${escapeHtml(category.status)} - ${escapeHtml(category.notes)}</small>
</div>`
  )
  .join("")}
  </div>
  <div class="score-support">
    ${renderSeverityChart(bundle.findings)}
    <div class="score-model">
      <span>Score model</span>
      <strong>Grouped issue impact</strong>
      <p>Scores use unique open/warning issue groups. Repeated affected URLs add capped impact, while passed and not-applicable checks do not lower scores.</p>
    </div>
  </div>
</section>`;
}

function renderHero(bundle: ReportBundle): string {
  return `<header class="hero">
    <div>
      <p class="eyebrow">SEO Polish Report</p>
      <h1>${escapeHtml(new URL(bundle.scan.config.url).hostname)}</h1>
      <p>${escapeHtml(bundle.scan.siteType)} site, ${escapeHtml(bundle.scan.techStack?.framework ?? bundle.scan.framework)} framework signal</p>
    </div>
    ${renderScoreRing(bundle.score.total, 100, bundle.score.level, "Combined SEO Polish Score", "large")}
  </header>`;
}

function renderScoreRing(
  score: number,
  maxScore: number,
  status: string,
  label: string,
  size: "large" | "small"
): string {
  const percent = scorePercent(score, maxScore);
  const angle = Math.round(percent * 3.6 * 10) / 10;
  return `<div class="score-ring ${size}" role="img" aria-label="${escapeHtml(label)}: ${score} out of ${maxScore}" style="--score-angle: ${angle}deg; --score-color: var(${scoreColorVar(status)});">
    <div class="score-ring-inner"><strong>${score}</strong><span>/${maxScore}</span></div>
  </div>`;
}

function renderSeverityChart(findings: Finding[]): string {
  const counts = countBySeverity(findings);
  const total = Math.max(1, findings.length);
  const severities: Array<keyof typeof counts> = ["critical", "high", "medium", "low", "info"];
  return `<div class="severity-chart" aria-label="Finding severity distribution">
    <span>Finding distribution</span>
    ${severities
      .map((severity) => {
        const count = counts[severity];
        const width = Math.round((count / total) * 1000) / 10;
        return `<div class="severity-row">
          <span>${severity}</span>
          <div class="severity-track"><i class="${severity}" style="width: ${width}%"></i></div>
          <strong>${count}</strong>
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderHtmlSection(number: number, title: string, bundle: ReportBundle): string {
  if (number === 1) {
    const counts = countBySeverity(bundle.findings);
    const groups = groupFindings(bundle.findings);
    const top = groups
      .slice(0, 5)
      .map(
        (finding) =>
          `<li>${escapeHtml(finding.id)} - ${escapeHtml(finding.title)}${escapeHtml(formatInstanceSuffix(finding.count))}</li>`
      )
      .join("");
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>Combined score: <strong>${bundle.score.total}/100</strong> (${escapeHtml(bundle.score.level)}). Findings are evidence-bound and generated from structured scan output.</p><p>${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info. ${groups.length} unique grouped issues.</p>${renderSiteIntelligence(bundle)}${groups.length > 0 ? `<h3>Top grouped findings</h3><ol>${top}</ol>` : `<p class="status">No open findings.</p>`}</section>`;
  }
  if (number === 3) {
    const instanceCounts = findingInstanceCounts(bundle.findings);
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${bundle.remediationPlan.phases
      .map((phase) => {
        const items = uniqueRemediationOptions(phase.items);
        return `<h3>${escapeHtml(phase.title)}</h3><p>${escapeHtml(phase.summary)}</p><ul>${items.map((item) => `<li>${escapeHtml(item.findingId)} - ${escapeHtml(item.title)}${escapeHtml(formatInstanceSuffix(instanceCounts.get(item.findingId)))}</li>`).join("") || "<li>No items.</li>"}</ul>`;
      })
      .join("")}</section>`;
  }
  if (number === 4) {
    return renderFindingRollupSection(
      number,
      title,
      bundle.findings.filter(
        (finding) =>
          !["agent_readiness", "protocol_discovery", "api_auth_mcp", "policy", "security"].includes(
            finding.category
          ) && ["critical", "high"].includes(finding.severity)
      ),
      bundle.scan.siteType
    );
  }
  if (number === 5) {
    return renderFindingRollupSection(
      number,
      title,
      bundle.findings.filter(
        (finding) =>
          ["agent_readiness", "protocol_discovery", "api_auth_mcp"].includes(finding.category) &&
          ["critical", "high"].includes(finding.severity)
      ),
      bundle.scan.siteType
    );
  }
  if (number === 18) {
    return renderFindingRollupSection(
      number,
      title,
      bundle.findings.filter((finding) => ["crawlability", "agent_readiness"].includes(finding.category)),
      bundle.scan.siteType
    );
  }
  if (number === 22) {
    return renderImplementationPlanSection(number, title, bundle);
  }
  if (number === 23) {
    return renderAgentInstructionsSection(number, title);
  }
  if (number === 24) {
    return renderValidationSection(number, title, bundle);
  }
  if (number === 25) {
    return renderUserDecisionSection(number, title, bundle);
  }
  if (number === 26) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>${bundle.scan.evidence.length} evidence entries, ${bundle.scan.pages.length} crawled pages, ${bundle.scan.performance?.resources.length ?? 0} resource timing entries.</p><ul class="summary-list">${["tech-stack.json", "repo-analysis.json", "route-templates.json", "performance-audit.json", "resource-timing.json", "performance-runs.jsonl", "third-party-cost.json", "largest-assets.json", "critical-request-chain.json", "actionability.json", "baseline-comparison.json", "suppression-report.json"].map((file) => `<li><code>${file}</code></li>`).join("")}</ul></section>`;
  }
  if (number === 27) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>The final executable handoff is written to <code>agent-execution-plan.md</code>. Rebuild it after benchmark data with <code>seo-polish plan build --report ${escapeHtml(bundle.scan.config.outputDir)}</code>.</p></section>`;
  }

  const section = REPORT_SECTIONS.find((item) => item.number === number);
  const findings = section
    ? bundle.findings.filter((finding) => section.categories.includes(finding.category))
    : [];
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${findings.length === 0 ? `<p class="status">Status: ${notApplicable(title, bundle.scan.siteType) ? "Not applicable" : "Passed"}</p>` : groupFindings(findings).map(renderFindingHtml).join("")}</section>`;
}

function renderSiteIntelligence(bundle: ReportBundle): string {
  const tech = bundle.scan.techStack;
  const repo = bundle.scan.repo;
  const perf = bundle.scan.performance;
  const failedMetrics = perf?.metrics.filter((metric) => metric.status === "failed").length ?? 0;
  return `<div class="intel-grid" aria-label="Site intelligence">
    <div><span>Tech stack</span><strong>${escapeHtml(tech ? `${tech.framework} (${tech.confidence}%)` : "not collected")}</strong></div>
    <div><span>Hosting/CDN</span><strong>${escapeHtml(tech ? [...tech.hosting, ...tech.cdn].join(", ") || "no strong signal" : "not collected")}</strong></div>
    <div><span>Repo analysis</span><strong>${escapeHtml(repo ? repo.status : "not configured")}</strong></div>
    <div><span>Route templates</span><strong>${bundle.scan.routeTemplates?.length ?? 0}</strong></div>
    <div><span>Performance</span><strong>${escapeHtml(perf ? `${perf.summary.totalRequests} requests, ${failedMetrics} failed budgets` : "not collected")}</strong></div>
  </div>`;
}

function renderImplementationPlanSection(number: number, title: string, bundle: ReportBundle): string {
  const safeFixes = uniqueRemediationOptions(bundle.remediationPlan.safeFixes);
  const manualItems = uniqueRemediationOptions(bundle.remediationPlan.manualRecommendations);
  const approvalItems = uniqueRemediationOptions(bundle.remediationPlan.approvalRequired);
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>
    <p>${safeFixes.length} safe auto-fix items, ${manualItems.length} manual strategy items, ${approvalItems.length} approval-required items.</p>
    ${renderRemediationList("Safe auto-fix", safeFixes, bundle.findings)}
    ${renderRemediationList("Manual strategy", manualItems, bundle.findings)}
    ${renderRemediationList("Approval required", approvalItems, bundle.findings)}
    <p>Patch preview is available in <code>patch.diff</code>. Full machine-readable details remain in <code>remediation-plan.json</code>.</p>
  </section>`;
}

function renderFindingRollupSection(
  number: number,
  title: string,
  findings: Finding[],
  siteType: string
): string {
  if (findings.length === 0) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p class="status">Status: ${notApplicable(title, siteType) ? "Not applicable" : "Passed"}</p></section>`;
  }
  const groups = groupFindings(findings);
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>
    <p>Grouped rollup. Full cards appear once in the category-specific sections and <code>findings.json</code> keeps every evidence instance.</p>
    <ul>${groups.map((finding) => `<li>${escapeHtml(finding.id)} - ${escapeHtml(finding.title)}${escapeHtml(formatInstanceSuffix(finding.count))} (${escapeHtml(finding.severity)}, ${escapeHtml(finding.category)})</li>`).join("")}</ul>
  </section>`;
}

function renderAgentInstructionsSection(number: number, title: string): string {
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>
    <ul class="summary-list">
      <li>Use <code>agent-execution-plan.md</code> as the final execution contract.</li>
      <li>Apply <code>safe_auto_fix</code> items only when the source repo path is clear.</li>
      <li>Keep policy, auth, payment, crawler, canonical and MCP mutation changes approval-required.</li>
      <li>Re-run scan, lint, validation, benchmark and project gates after implementation.</li>
    </ul>
  </section>`;
}

function renderValidationSection(number: number, title: string, bundle: ReportBundle): string {
  const counts = validationStatusCounts(bundle.validation.checks);
  const attention = attentionValidationChecks(bundle.validation.checks);
  const omitted = counts.passed + counts.not_applicable;
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>
    <p>Status: <strong>${bundle.validation.ok ? "Passed" : "Failed"}</strong>. ${counts.failed} failed, ${counts.warning} warning, ${counts.passed} passed, ${counts.not_applicable} not applicable.</p>
    ${
      attention.length === 0
        ? `<p class="status">No failed or warning checks. Passed/not-applicable checks omitted: ${omitted}.</p>`
        : `<ul>${attention.map((check) => `<li><strong>${escapeHtml(check.status)}</strong> ${escapeHtml(check.title)} - ${escapeHtml(check.message)}</li>`).join("")}</ul><p>Passed/not-applicable checks omitted: ${omitted}. See <code>validation.json</code> for the full machine log.</p>`
    }
  </section>`;
}

function renderUserDecisionSection(number: number, title: string, bundle: ReportBundle): string {
  const decisions = bundle.remediationPlan.userDecisions;
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${
    decisions.length === 0
      ? `<p class="status">No owner decisions currently required.</p>`
      : `<ol>${decisions.map((decision) => `<li><strong>${escapeHtml(decision.title)}</strong><br>${escapeHtml(decision.reason)}<br>Default: ${escapeHtml(decision.default)}</li>`).join("")}</ol>`
  }</section>`;
}

function renderRemediationList(
  title: string,
  items: ReportBundle["remediationPlan"]["safeFixes"],
  findings: Finding[]
): string {
  const instanceCounts = findingInstanceCounts(findings);
  return `<h3>${escapeHtml(title)}</h3><ul>${
    items.length === 0
      ? "<li>No items.</li>"
      : items
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.findingId)}${escapeHtml(formatInstanceSuffix(instanceCounts.get(item.findingId)))}</strong>: ${escapeHtml(item.implementationPath)}</li>`
          )
          .join("")
  }</ul>`;
}

function renderFindingHtml(finding: ReturnType<typeof groupFindings>[number], index: number): string {
  const commandId = `validation-${index}-${slugify(finding.id)}`;
  return `<article class="finding" data-severity="${escapeHtml(finding.severity)}">
  <h3>${escapeHtml(finding.id)} - ${escapeHtml(finding.title)}</h3>
  <div class="meta">
    <span class="badge ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
    <span>${escapeHtml(finding.category)}</span>
    <span>${finding.count} instance${finding.count === 1 ? "" : "s"}</span>
    <span>${finding.evidenceCount} evidence entries</span>
    <span>Auto-fix: ${finding.safeToAutoFix ? "yes" : "no"}</span>
    <span>Approval: ${finding.approvalRequired ? "yes" : "no"}</span>
    <span>Owner: ${escapeHtml(formatSet(finding.owners))}</span>
    <span>Readiness: ${escapeHtml(formatSet(finding.automationReadiness))}</span>
  </div>
  <p><strong>Impact:</strong> ${escapeHtml(finding.impact)}</p>
  <p><strong>Root cause:</strong> ${escapeHtml(finding.rootCause)}</p>
  <p><strong>Recommended fix:</strong> ${escapeHtml(finding.recommendation)}</p>
  <details>
    <summary>Affected surface</summary>
    <p><strong>URLs:</strong> ${escapeHtml(formatSet(finding.affectedUrls))}</p>
    <p><strong>Templates:</strong> ${escapeHtml(formatSet(finding.affectedTemplates))}</p>
    <p><strong>Source candidates:</strong> ${escapeHtml(formatSet(finding.sourceLocations))}</p>
    <p><strong>Blockers:</strong> ${escapeHtml(formatSet(finding.blockers))}</p>
  </details>
  <pre id="${commandId}"><code>${escapeHtml(finding.validation.join("\n"))}</code></pre>
  <button type="button" data-copy="${commandId}">Copy validation</button>
  <span class="copy-status" data-copy-status aria-live="polite"></span>
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

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "finding"
  );
}

function scorePercent(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (score / maxScore) * 100));
}

function scoreColorVar(status: string): string {
  if (status === "excellent") return "--sp-pass";
  if (status === "strong") return "--sp-low";
  if (status === "medium") return "--sp-medium";
  if (status === "weak") return "--sp-high";
  return "--sp-critical";
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
.score-ring { flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--score-color) var(--score-angle), var(--sp-border) 0); box-shadow: var(--sp-shadow); }
.score-ring.large { width: 154px; height: 154px; }
.score-ring.small { width: 76px; height: 76px; box-shadow: none; }
.score-ring-inner { width: calc(100% - 18px); height: calc(100% - 18px); border: 1px solid rgba(255,255,255,.08); border-radius: 50%; display: grid; place-items: center; align-content: center; background: var(--sp-surface); }
.score-ring strong { font-size: 44px; line-height: .95; }
.score-ring.small strong { font-size: 22px; }
.score-ring span { font-size: 15px; color: var(--sp-muted); }
.score-ring.small span { font-size: 11px; }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 28px; padding: 28px max(24px, 6vw); }
.toc { position: sticky; top: 20px; align-self: start; display: grid; gap: 8px; max-height: calc(100vh - 40px); overflow: auto; }
.toc a { color: var(--sp-muted); text-decoration: none; border-left: 2px solid var(--sp-border); padding: 4px 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
button { background: var(--sp-surface-soft); border: 1px solid var(--sp-border); color: var(--sp-text); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
button.is-active { border-color: var(--sp-low); box-shadow: 0 0 0 2px rgba(56,189,248,.22); }
section { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--sp-border); }
h2 { margin-top: 0; font-size: 24px; letter-spacing: 0; }
h3 { letter-spacing: 0; }
.score-overview { margin-bottom: 32px; }
.score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.score-support { display: grid; grid-template-columns: minmax(260px, 1.35fr) minmax(220px, .65fr); gap: 12px; margin-top: 12px; }
.intel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 16px 0 20px; }
.intel-grid div { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: 8px; padding: 12px; }
.intel-grid span { display: block; color: var(--sp-muted); font-size: 12px; }
.intel-grid strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.metric, .finding { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius); padding: 16px; }
.metric-head { display: flex; align-items: center; gap: 14px; }
.metric strong { display: block; margin: 6px 0; font-size: 28px; }
.metric small { color: var(--sp-muted); }
.severity-chart, .score-model { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius); padding: 16px; }
.severity-chart > span, .score-model > span { display: block; color: var(--sp-muted); font-size: 12px; margin-bottom: 10px; }
.score-model strong { display: block; font-size: 20px; margin-bottom: 8px; }
.score-model p { margin: 0; color: var(--sp-muted); }
.severity-row { display: grid; grid-template-columns: 74px minmax(0, 1fr) 34px; align-items: center; gap: 10px; margin: 9px 0; }
.severity-row > span { color: var(--sp-muted); text-transform: capitalize; }
.severity-row strong { text-align: right; }
.severity-track { height: 10px; border-radius: 999px; background: #05070a; overflow: hidden; border: 1px solid var(--sp-border); }
.severity-track i { display: block; height: 100%; border-radius: inherit; }
.finding { margin: 14px 0; }
.finding[hidden] { display: none; }
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
.summary-list { display: grid; gap: 8px; padding-left: 20px; }
.copy-status { margin-left: 10px; color: var(--sp-muted); font-size: 13px; }
@media (max-width: 860px) {
  .hero { display: block; }
  .score-ring.large { margin-top: 20px; }
  .layout { display: block; }
  .toc { position: static; margin-bottom: 20px; }
  .score-support { grid-template-columns: 1fr; }
}
@media print {
  body { background: white; color: black; }
  .toc, .toolbar, button { display: none; }
  .layout { display: block; padding: 0; }
  .metric, .finding { border-color: #ccc; }
}
`;

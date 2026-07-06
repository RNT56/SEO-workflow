import type {
  Finding,
  ReportBundle,
  ReportDashboard,
  ReportDashboardQueueItem,
  ReportDashboardTemplateHeatmapItem
} from "@seo-polish/schemas";
import { REPORT_SECTIONS } from "@seo-polish/schemas";
import { buildReportDashboard } from "./buildReportDashboard.js";
import {
  FIX_CLASS_LABEL,
  attentionValidationChecks,
  countBySeverity,
  findingInstanceCounts,
  formatInstanceSuffix,
  formatSet,
  groupFindings,
  uniqueRemediationOptions,
  validationStatusCounts
} from "./reportSignal.js";

export interface RenderHtmlReportOptions {
  dashboard?: ReportDashboard;
}

export function renderHtmlReport(bundle: ReportBundle, options: RenderHtmlReportOptions = {}): string {
  const dashboard = options.dashboard ?? buildReportDashboard(bundle);
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
      <a href="#execution-cockpit">Execution cockpit</a>
      ${REPORT_SECTIONS.map((section) => `<a href="#section-${section.number}">${section.number}. ${escapeHtml(section.title)}</a>`).join("")}
    </nav>
    <article>
      ${renderCockpit(bundle, dashboard)}
      <section class="toolbar" aria-label="Finding filters">
        <span>Detailed findings</span>
        <button type="button" data-filter="all" aria-pressed="true" class="is-active">All</button>
        <button type="button" data-filter="critical" aria-pressed="false">Critical</button>
        <button type="button" data-filter="high" aria-pressed="false">High</button>
        <button type="button" data-filter="medium" aria-pressed="false">Medium</button>
        <button type="button" data-filter="low" aria-pressed="false">Low</button>
        <button type="button" data-filter="info" aria-pressed="false">Info</button>
      </section>
      ${REPORT_SECTIONS.map((section) => renderHtmlSection(section.number, section.title, bundle)).join("")}
    </article>
  </main>
  <script>
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    const findingCards = Array.from(document.querySelectorAll('[data-finding-card]'));
    const viewTabs = Array.from(document.querySelectorAll('[data-view-tab]'));
    const viewPanels = Array.from(document.querySelectorAll('[data-view-panel]'));
    const queueFilters = Array.from(document.querySelectorAll('[data-queue-filter]'));
    const queueCards = Array.from(document.querySelectorAll('[data-queue-card]'));

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

    function applyQueueFilters() {
      const values = Object.fromEntries(queueFilters.map((control) => [control.getAttribute('data-queue-filter'), control.value]));
      let visible = 0;
      queueCards.forEach((card) => {
        const hidden = (
          (values.owner && values.owner !== 'all' && card.getAttribute('data-owner') !== values.owner) ||
          (values.fixClass && values.fixClass !== 'all' && card.getAttribute('data-fix-class') !== values.fixClass) ||
          (values.readiness && values.readiness !== 'all' && card.getAttribute('data-readiness') !== values.readiness) ||
          (values.approval && values.approval !== 'all' && card.getAttribute('data-approval') !== values.approval)
        );
        card.hidden = hidden;
        if (!hidden) visible += 1;
      });
      const status = document.querySelector('[data-queue-count]');
      if (status) status.textContent = String(visible);
    }

    function showView(value) {
      viewPanels.forEach((panel) => {
        panel.hidden = panel.getAttribute('data-view-panel') !== value;
      });
      viewTabs.forEach((button) => {
        const active = button.getAttribute('data-view-tab') === value;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
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
    viewTabs.forEach((button) => {
      button.addEventListener('click', () => showView(button.getAttribute('data-view-tab') || 'overview'));
    });
    queueFilters.forEach((control) => control.addEventListener('change', applyQueueFilters));
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
    applyQueueFilters();
  </script>
</body>
</html>`;
}

function renderCockpit(bundle: ReportBundle, dashboard: ReportDashboard): string {
  const views = [
    ["overview", "Overview"],
    ["implementation", "Implementation"],
    ["performance", "Performance"],
    ["templates", "Templates"],
    ["comparison", "Comparison"],
    ["evidence", "Evidence"]
  ] as const;
  return `<section id="execution-cockpit" class="cockpit">
    <div class="view-tabs" role="tablist" aria-label="Report views">
      ${views
        .map(
          ([id, label], index) =>
            `<button type="button" role="tab" data-view-tab="${id}" aria-controls="view-${id}" aria-selected="${index === 0 ? "true" : "false"}" class="${index === 0 ? "is-active" : ""}">${label}</button>`
        )
        .join("")}
    </div>
    <div id="view-overview" data-view-panel="overview" role="tabpanel">
      ${renderOverviewView(bundle, dashboard)}
    </div>
    <div id="view-implementation" data-view-panel="implementation" role="tabpanel" hidden>
      ${renderImplementationView(bundle, dashboard)}
    </div>
    <div id="view-performance" data-view-panel="performance" role="tabpanel" hidden>
      ${renderPerformanceView(dashboard)}
    </div>
    <div id="view-templates" data-view-panel="templates" role="tabpanel" hidden>
      ${renderTemplateView(dashboard)}
    </div>
    <div id="view-comparison" data-view-panel="comparison" role="tabpanel" hidden>
      ${renderComparisonView(dashboard)}
    </div>
    <div id="view-evidence" data-view-panel="evidence" role="tabpanel" hidden>
      ${renderEvidenceView(bundle, dashboard)}
    </div>
  </section>`;
}

function renderOverviewView(bundle: ReportBundle, dashboard: ReportDashboard): string {
  return `<div class="view-grid">
    <div class="panel executive-panel">
      <p class="panel-label">Executive Summary</p>
      <h2>${dashboard.score.total}/100 ${escapeHtml(dashboard.score.level)}</h2>
      <p>Validation ${escapeHtml(dashboard.executiveSummary.validationState)}. Quality gate ${escapeHtml(dashboard.qualityGateStatus)}. ${dashboard.executiveSummary.remainingApprovals} approval-gated items remain.</p>
      ${renderSiteIntelligence(bundle)}
    </div>
    <div class="panel">
      <p class="panel-label">Top Risks</p>
      ${renderQueueMiniList(dashboard.executiveSummary.topRisks, "No critical or high risks detected.")}
    </div>
    <div class="panel">
      <p class="panel-label">Top Wins</p>
      ${renderQueueMiniList(dashboard.executiveSummary.topWins, "No high-impact quick wins detected.")}
    </div>
  </div>
  ${renderScoreGrid(bundle)}
  <div class="stat-strip">
    ${statCard("Findings", String(dashboard.evidenceStats.findings), `${dashboard.evidenceStats.groupedFindings} grouped`)}
    ${statCard("Safe fixes", String(dashboard.evidenceStats.safeAutoFixes), "non-approval queue")}
    ${statCard("Approvals", String(dashboard.evidenceStats.approvalRequired), "owner decision required")}
    ${statCard("Templates", String(dashboard.templateHeatmap.length), "issue heatmap entries")}
  </div>`;
}

function renderImplementationView(bundle: ReportBundle, dashboard: ReportDashboard): string {
  return `<div class="panel">
    <div class="panel-head">
      <div>
        <p class="panel-label">Implementation Queue</p>
        <h2><span data-queue-count>${dashboard.implementationQueue.length}</span> visible items</h2>
      </div>
      <p>${dashboard.nextBestFixes.length} next-best fixes, ${dashboard.approvalQueue.length} approval-gated decisions.</p>
    </div>
    ${renderQueueFilters(dashboard)}
    <h3>Next Best Fixes</h3>
    ${renderQueueCards(dashboard.nextBestFixes, "No next-best fixes are currently available.", "next")}
    <h3>Impact vs Effort</h3>
    ${renderImpactEffortMatrix(dashboard)}
    <h3>Phase Timeline</h3>
    ${renderPhaseTimeline(bundle)}
    <h3>Full Implementation Queue</h3>
    ${renderQueueCards(dashboard.implementationQueue, "No implementation items are currently available.", "all")}
  </div>`;
}

function renderPerformanceView(dashboard: ReportDashboard): string {
  const perf = dashboard.performanceSummary;
  return `<div class="view-grid">
    <div class="panel">
      <p class="panel-label">Budget Status</p>
      <div class="budget-grid">
        ${Object.entries(perf.statusCounts)
          .map(([status, count]) => `<div><span>${escapeHtml(status)}</span><strong>${count}</strong></div>`)
          .join("")}
      </div>
      <div class="metric-bars">
        ${perf.metrics.map(renderPerformanceMetric).join("")}
      </div>
    </div>
    <div class="panel">
      <p class="panel-label">Timing Variance</p>
      <div class="timing-grid">
        ${statCard("Runs", String(perf.timing.runs), "document fetch samples")}
        ${statCard("Median", formatMetricValue(perf.timing.medianDocumentFetchMs, "ms"), "document fetch")}
        ${statCard("P95", formatMetricValue(perf.timing.p95DocumentFetchMs, "ms"), "document fetch")}
        ${statCard("Max", formatMetricValue(perf.timing.maxDocumentFetchMs, "ms"), "document fetch")}
      </div>
    </div>
    ${renderBrowserEvidencePanel(perf)}
    <div class="panel">
      <p class="panel-label">Third-Party Cost</p>
      <h2>${perf.thirdParty.requests} requests</h2>
      <p>${perf.thirdParty.knownKb} KB known transfer. Hosts: ${perf.thirdParty.hosts.map(escapeHtml).join(", ") || "none detected"}.</p>
    </div>
    <div class="panel">
      <p class="panel-label">Largest Assets</p>
      ${perf.largestAssets.length === 0 ? emptyState("No sized assets were available.") : `<ol class="compact-list">${perf.largestAssets.map((asset) => `<li><strong>${formatBytes(asset.bytes)}</strong> ${escapeHtml(asset.type)} ${escapeHtml(shortUrl(asset.url))}${asset.thirdParty ? " third-party" : ""}</li>`).join("")}</ol>`}
    </div>
    <div class="panel">
      <p class="panel-label">Render Blocking</p>
      ${perf.renderBlocking.length === 0 ? emptyState("No static render-blocking resources detected.") : `<ol class="compact-list">${perf.renderBlocking.map((resource) => `<li>${escapeHtml(resource.type)} ${escapeHtml(shortUrl(resource.url))} ${resource.bytes ? `(${formatBytes(resource.bytes)})` : ""}</li>`).join("")}</ol>`}
    </div>
    <div class="panel">
      <p class="panel-label">Limitations</p>
      <ul class="compact-list">${perf.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join("")}</ul>
    </div>
  </div>`;
}

function renderBrowserEvidencePanel(perf: ReportDashboard["performanceSummary"]): string {
  const browser = perf.browserEvidence;
  const coverage = browser.browserMetricCoverage;
  return `<div class="panel">
    <p class="panel-label">Browser Evidence</p>
    <h2>${escapeHtml(browser.status)}</h2>
    <div class="timing-grid">
      ${statCard("Pages", String(browser.pagesVisited), "rendered sample")}
      ${statCard("Console", String(browser.consoleErrors), "errors")}
      ${statCard("Failed", String(browser.failedRequests), "requests")}
      ${statCard("LCP", `${coverage.lcp}/${browser.pagesVisited}`, "covered pages")}
    </div>
    <p>Runtime: ${[...browser.detectedFrameworks, ...browser.detectedBundlers].map(escapeHtml).join(", ") || "no browser runtime markers collected"}.</p>
    ${
      browser.hydrationRiskUrls.length === 0
        ? `<p class="muted">No raw-vs-rendered changes were flagged in the sampled pages.</p>`
        : `<details><summary>${browser.hydrationRiskUrls.length} raw-vs-rendered review target(s)</summary><ul class="compact-list">${browser.hydrationRiskUrls.map((url) => `<li>${escapeHtml(shortUrl(url))}</li>`).join("")}</ul></details>`
    }
  </div>`;
}

function renderTemplateView(dashboard: ReportDashboard): string {
  return `<div class="panel">
    <div class="panel-head">
      <div>
        <p class="panel-label">Route Template Heatmap</p>
        <h2>${dashboard.templateHeatmap.length} affected templates</h2>
      </div>
      <p>Templates are ranked by critical/high count, then total issue count.</p>
    </div>
    ${
      dashboard.templateHeatmap.length === 0
        ? emptyState("No template-level issues were detected.")
        : `<div class="heatmap">${dashboard.templateHeatmap.map(renderTemplateHeatmapItem).join("")}</div>`
    }
  </div>`;
}

function renderComparisonView(dashboard: ReportDashboard): string {
  const baseline = dashboard.baselineSummary;
  return `<div class="view-grid">
    <div class="panel">
      <p class="panel-label">Baseline Status</p>
      <h2>${escapeHtml(baseline.status)}</h2>
      <p>Score delta: <strong>${baseline.scoreDelta === null ? "not available" : signedNumber(baseline.scoreDelta)}</strong></p>
      <ul class="compact-list">${baseline.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
    </div>
    ${comparisonPanel("New Issues", baseline.newFindingGroups)}
    ${comparisonPanel("Resolved Issues", baseline.resolvedFindingGroups)}
    ${comparisonPanel("Recurring Issues", baseline.recurringFindingGroups)}
    <div class="panel">
      <p class="panel-label">Performance Deltas</p>
      ${
        Object.keys(baseline.performanceDeltas).length === 0
          ? emptyState("No comparable performance deltas available.")
          : `<ul class="compact-list">${Object.entries(baseline.performanceDeltas)
              .map(([id, value]) => `<li>${escapeHtml(id)}: ${signedNumber(value)}</li>`)
              .join("")}</ul>`
      }
    </div>
  </div>`;
}

function renderEvidenceView(bundle: ReportBundle, dashboard: ReportDashboard): string {
  return `<div class="view-grid">
    <div class="panel">
      <p class="panel-label">Evidence Stats</p>
      <div class="timing-grid">
        ${statCard("Evidence", String(dashboard.evidenceStats.evidenceEntries), "entries")}
        ${statCard("Pages", String(dashboard.evidenceStats.pages), "crawled")}
        ${statCard("Resources", String(dashboard.evidenceStats.resources), "timed/discovered")}
        ${statCard("Commands", String(dashboard.evidenceStats.validationCommands), "validation")}
      </div>
    </div>
    <div class="panel">
      <p class="panel-label">Evidence Files</p>
      <ul class="summary-list">${["findings.json", "evidence.jsonl", "report-dashboard.json", "browser-evidence.json", "performance-audit.json", "resource-timing.json", "route-templates.json", "validation.json"].map((file) => `<li><code>${file}</code></li>`).join("")}</ul>
    </div>
  </div>
  <div class="panel">
    <p class="panel-label">Grouped Evidence Drawers</p>
    ${
      groupFindings(bundle.findings)
        .map((finding, index) => renderFindingHtml(finding, index, "evidence"))
        .join("") || emptyState("No open evidence-backed findings.")
    }
  </div>`;
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
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>Combined score: <strong>${bundle.score.total}/100</strong> (${escapeHtml(bundle.score.level)}). Findings are evidence-bound and generated from structured scan output.</p><p>${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info. ${groups.length} unique grouped issues.</p>${renderSiteIntelligence(bundle)}${groups.length > 0 ? `<h3>Top grouped findings</h3><ol>${top}</ol>` : emptyState("No open findings.")}</section>`;
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
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>${bundle.scan.evidence.length} evidence entries, ${bundle.scan.pages.length} crawled pages, ${bundle.scan.performance?.resources.length ?? 0} resource timing entries.</p><ul class="summary-list">${["report-dashboard.json", "tech-stack.json", "browser-evidence.json", "repo-analysis.json", "route-templates.json", "performance-audit.json", "resource-timing.json", "performance-runs.jsonl", "third-party-cost.json", "largest-assets.json", "critical-request-chain.json", "actionability.json", "baseline-comparison.json", "suppression-report.json"].map((file) => `<li><code>${file}</code></li>`).join("")}</ul></section>`;
  }
  if (number === 27) {
    return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2><p>The final executable handoff is written to <code>agent-execution-plan.md</code>. Rebuild it after benchmark data with <code>seo-polish plan build --report ${escapeHtml(bundle.scan.config.outputDir)}</code>.</p></section>`;
  }

  const section = REPORT_SECTIONS.find((item) => item.number === number);
  const findings = section
    ? bundle.findings.filter((finding) => section.categories.includes(finding.category))
    : [];
  return `<section id="section-${number}"><h2>${number}. ${escapeHtml(title)}</h2>${
    findings.length === 0
      ? `<p class="status">Status: ${notApplicable(title, bundle.scan.siteType) ? "Not applicable" : "Passed"}</p>`
      : groupFindings(findings)
          .map((finding, index) => renderFindingHtml(finding, index, `section-${number}`))
          .join("")
  }</section>`;
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
    <p>Patch preview is available in <code>patch.diff</code>. Full machine-readable details remain in <code>remediation-plan.json</code> and <code>report-dashboard.json</code>.</p>
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
      <li>Use <code>report-dashboard.json</code> as the stable implementation queue and dashboard data model.</li>
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
      ? emptyState("No owner decisions currently required.")
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

function renderFindingHtml(
  finding: ReturnType<typeof groupFindings>[number],
  index: number,
  prefix: string
): string {
  const commandId = `validation-${prefix}-${index}-${slugify(finding.id)}`;
  return `<article class="finding" data-finding-card data-severity="${escapeHtml(finding.severity)}">
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
  <p><strong>Recommended fix:</strong> ${escapeHtml(finding.recommendation)}</p>
  <details class="evidence-drawer">
    <summary>Evidence, source candidates and validation</summary>
    <p><strong>Root cause:</strong> ${escapeHtml(finding.rootCause)}</p>
    <p><strong>URLs:</strong> ${escapeHtml(formatSet(finding.affectedUrls))}</p>
    <p><strong>Templates:</strong> ${escapeHtml(formatSet(finding.affectedTemplates))}</p>
    <p><strong>Source candidates:</strong> ${escapeHtml(formatSet(finding.sourceLocations))}</p>
    <p><strong>Blockers:</strong> ${escapeHtml(formatSet(finding.blockers))}</p>
    <pre id="${commandId}"><code>${escapeHtml(finding.validation.join("\n"))}</code></pre>
    <button type="button" data-copy="${commandId}">Copy validation</button>
    <span class="copy-status" data-copy-status aria-live="polite"></span>
  </details>
</article>`;
}

function renderQueueFilters(dashboard: ReportDashboard): string {
  return `<div class="filter-grid" aria-label="Implementation queue filters">
    ${selectFilter("owner", "Owner", dashboard.filters.owners)}
    ${selectFilter("fixClass", "Fix class", dashboard.filters.fixClasses)}
    ${selectFilter("readiness", "Readiness", dashboard.filters.automationReadiness)}
    ${selectFilter("approval", "Approval", dashboard.filters.approvalStates)}
  </div>`;
}

function selectFilter(id: string, label: string, values: string[]): string {
  return `<label>${escapeHtml(label)}
    <select data-queue-filter="${escapeHtml(id)}">
      <option value="all">All</option>
      ${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}
    </select>
  </label>`;
}

function renderQueueCards(items: ReportDashboardQueueItem[], empty: string, prefix: string): string {
  if (items.length === 0) {
    return emptyState(empty);
  }
  return `<div class="queue-grid">${items.map((item, index) => renderQueueCard(item, `${prefix}-${index}`)).join("")}</div>`;
}

function renderQueueCard(item: ReportDashboardQueueItem, suffix: string): string {
  const commandId = `queue-validation-${suffix}-${slugify(item.id)}`;
  return `<article class="queue-card" data-queue-card data-owner="${escapeHtml(item.owner)}" data-fix-class="${escapeHtml(item.fixClass)}" data-readiness="${escapeHtml(item.automationReadiness)}" data-approval="${item.approvalRequired ? "approval_required" : "no_approval_required"}">
    <div class="queue-card-head">
      <div>
        <span class="badge ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span>
        <h4>${escapeHtml(item.findingId)} - ${escapeHtml(item.title)}</h4>
      </div>
      <strong>${escapeHtml(item.expectedImpact)} impact</strong>
    </div>
    <div class="meta">
      <span>${escapeHtml(FIX_CLASS_LABEL[item.fixClass])}</span>
      <span>Owner: ${escapeHtml(item.owner)}</span>
      <span>Effort: ${escapeHtml(item.effort)}</span>
      <span>Risk: ${escapeHtml(item.risk)}</span>
      <span>Readiness: ${escapeHtml(item.automationReadiness)}</span>
      <span>Approval: ${item.approvalRequired ? "yes" : "no"}</span>
    </div>
    <p>${escapeHtml(item.nextStep)}</p>
    <details class="evidence-drawer">
      <summary>Fix preview and validation</summary>
      <p><strong>Source candidates:</strong> ${escapeHtml(item.sourceCandidates.join(", ") || "needs repo access")}</p>
      <p><strong>Affected templates:</strong> ${escapeHtml(item.affectedTemplates.join(", ") || "N/A")}</p>
      <p><strong>Affected URLs:</strong> ${escapeHtml(item.affectedUrls.slice(0, 8).join(", ") || "N/A")}</p>
      <p><strong>Instances:</strong> ${item.instances}. <strong>Evidence entries:</strong> ${item.evidenceCount}.</p>
      <pre id="${commandId}"><code>${escapeHtml(item.validationCommand)}</code></pre>
      <button type="button" data-copy="${commandId}">Copy validation</button>
      <span class="copy-status" data-copy-status aria-live="polite"></span>
    </details>
  </article>`;
}

function renderQueueMiniList(items: ReportDashboardQueueItem[], empty: string): string {
  if (items.length === 0) return emptyState(empty);
  return `<ol class="compact-list">${items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.findingId)}</strong> ${escapeHtml(item.title)} <span>${escapeHtml(item.owner)}</span></li>`
    )
    .join("")}</ol>`;
}

function renderImpactEffortMatrix(dashboard: ReportDashboard): string {
  return `<div class="matrix-grid">${dashboard.impactEffortMatrix
    .map(
      (quadrant) => `<div class="matrix-cell">
        <p class="panel-label">${escapeHtml(quadrant.label)}</p>
        <p>${escapeHtml(quadrant.summary)}</p>
        ${renderQueueMiniList(quadrant.items.slice(0, 5), "No items in this quadrant.")}
      </div>`
    )
    .join("")}</div>`;
}

function renderPhaseTimeline(bundle: ReportBundle): string {
  return `<div class="timeline">${bundle.remediationPlan.phases
    .map(
      (phase, index) =>
        `<div><span>${index + 1}</span><strong>${escapeHtml(phase.title)}</strong><p>${escapeHtml(phase.summary)}</p></div>`
    )
    .join("")}</div>`;
}

function renderPerformanceMetric(metric: ReportDashboard["performanceSummary"]["metrics"][number]): string {
  const percent =
    typeof metric.value === "number" && typeof metric.budget === "number" && metric.budget > 0
      ? Math.min(100, Math.round((metric.value / metric.budget) * 100))
      : metric.status === "passed"
        ? 100
        : 0;
  return `<div class="metric-bar">
    <div><strong>${escapeHtml(metric.label)}</strong><span>${formatMetricValue(metric.value, metric.unit)}${metric.budget ? ` / ${metric.budget}${metric.unit}` : ""} - ${escapeHtml(metric.reliability)}</span></div>
    <div class="bar-track"><i class="${escapeHtml(metric.status)}" style="width:${percent}%"></i></div>
  </div>`;
}

function renderTemplateHeatmapItem(item: ReportDashboardTemplateHeatmapItem): string {
  const intensity = Math.min(100, Math.max(12, item.issueCount * 12 + item.criticalHighCount * 18));
  return `<article class="heatmap-item" style="--heat:${intensity}%">
    <div>
      <h3>${escapeHtml(item.template)}</h3>
      <p>${escapeHtml(item.urlPattern ?? item.representativeUrl ?? "No route pattern available")}</p>
    </div>
    <div class="heatbar"><i style="width:${intensity}%"></i></div>
    <p><strong>${item.issueCount}</strong> issues, <strong>${item.criticalHighCount}</strong> critical/high, <strong>${item.pageCount}</strong> pages.</p>
    <p><strong>Owners:</strong> ${item.owners.map(escapeHtml).join(", ") || "unknown"}</p>
    <p><strong>Source candidates:</strong> ${item.sourceCandidates.map(escapeHtml).join(", ") || "needs repo access"}</p>
  </article>`;
}

function comparisonPanel(title: string, items: string[]): string {
  return `<div class="panel"><p class="panel-label">${escapeHtml(title)}</p>${items.length === 0 ? emptyState("No items.") : `<ul class="compact-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`}</div>`;
}

function statCard(label: string, value: string, note: string): string {
  return `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function emptyState(message: string): string {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
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

function formatMetricValue(value: number | null, unit: string): string {
  return value === null ? "not measured" : `${value}${unit}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
  return `${Math.round((bytes / 1024) * 10) / 10} KB`;
}

function shortUrl(input: string): string {
  try {
    const url = new URL(input);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return input;
  }
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const REPORT_CSS = `
:root {
  --sp-bg: #f5f7f8;
  --sp-surface: #ffffff;
  --sp-surface-soft: #eef2f5;
  --sp-text: #17212b;
  --sp-muted: #5d6b7a;
  --sp-border: #d7dde3;
  --sp-critical: #dc2626;
  --sp-high: #ea580c;
  --sp-medium: #ca8a04;
  --sp-low: #0284c7;
  --sp-info: #7c3aed;
  --sp-pass: #15803d;
  --sp-accent: #2563eb;
  --sp-radius: 8px;
  --sp-shadow: 0 12px 28px rgba(15, 23, 42, .08);
  --sp-font: Inter, ui-sans-serif, system-ui, sans-serif;
  --sp-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--sp-bg); color: var(--sp-text); font-family: var(--sp-font); }
.hero { display: flex; justify-content: space-between; gap: 24px; padding: 36px max(24px, 6vw); border-bottom: 1px solid #1f2937; background: #101820; color: #f8fafc; }
.hero h1 { margin: 0; font-size: 40px; letter-spacing: 0; overflow-wrap: anywhere; }
.eyebrow { color: #a8b3c1; text-transform: uppercase; font-size: 12px; letter-spacing: .12em; }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 28px; padding: 28px max(24px, 6vw); }
.toc { position: sticky; top: 20px; align-self: start; display: grid; gap: 8px; max-height: calc(100vh - 40px); overflow: auto; }
.toc a { color: var(--sp-muted); text-decoration: none; border-left: 2px solid var(--sp-border); padding: 4px 10px; }
.toc a:hover { color: var(--sp-text); border-color: var(--sp-accent); }
section { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--sp-border); }
h2 { margin: 0 0 14px; font-size: 24px; letter-spacing: 0; }
h3, h4 { letter-spacing: 0; }
button, select { background: var(--sp-surface); border: 1px solid var(--sp-border); color: var(--sp-text); border-radius: 8px; padding: 8px 10px; }
button { cursor: pointer; }
button.is-active { border-color: var(--sp-accent); box-shadow: 0 0 0 2px rgba(37,99,235,.18); }
.view-tabs, .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; align-items: center; }
.toolbar > span { color: var(--sp-muted); margin-right: 6px; }
.cockpit { border: 0; padding-bottom: 8px; }
.view-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.panel, .metric, .finding, .queue-card, .matrix-cell, .heatmap-item, .severity-chart, .score-model, .stat-card { background: var(--sp-surface); border: 1px solid var(--sp-border); border-radius: var(--sp-radius); padding: 16px; box-shadow: var(--sp-shadow); }
.panel-head, .queue-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.panel-label { margin: 0 0 8px; color: var(--sp-muted); text-transform: uppercase; font-size: 12px; letter-spacing: .08em; }
.executive-panel h2 { font-size: 38px; }
.score-ring { flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--score-color) var(--score-angle), rgba(255,255,255,.16) 0); box-shadow: var(--sp-shadow); }
.score-ring.large { width: 150px; height: 150px; }
.score-ring.small { width: 74px; height: 74px; box-shadow: none; }
.score-ring-inner { width: calc(100% - 18px); height: calc(100% - 18px); border: 1px solid rgba(255,255,255,.12); border-radius: 50%; display: grid; place-items: center; align-content: center; background: var(--sp-surface); color: var(--sp-text); }
.score-ring strong { font-size: 42px; line-height: .95; }
.score-ring.small strong { font-size: 22px; }
.score-ring span { font-size: 15px; color: var(--sp-muted); }
.score-ring.small span { font-size: 11px; }
.score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.score-support { display: grid; grid-template-columns: minmax(260px, 1.35fr) minmax(220px, .65fr); gap: 12px; margin-top: 12px; }
.metric-head { display: flex; align-items: center; gap: 14px; }
.metric strong { display: block; margin: 6px 0; font-size: 28px; }
.metric small, .score-model p, .queue-card p, .heatmap-item p, .panel p { color: var(--sp-muted); }
.intel-grid, .stat-strip, .timing-grid, .budget-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 16px 0; }
.intel-grid div, .budget-grid div { background: var(--sp-surface-soft); border: 1px solid var(--sp-border); border-radius: 8px; padding: 12px; }
.intel-grid span, .stat-card span, .budget-grid span { display: block; color: var(--sp-muted); font-size: 12px; }
.intel-grid strong, .stat-card strong, .budget-grid strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.severity-chart > span, .score-model > span { display: block; color: var(--sp-muted); font-size: 12px; margin-bottom: 10px; }
.severity-row { display: grid; grid-template-columns: 74px minmax(0, 1fr) 34px; align-items: center; gap: 10px; margin: 9px 0; }
.severity-row > span { color: var(--sp-muted); text-transform: capitalize; }
.severity-row strong { text-align: right; }
.severity-track, .bar-track, .heatbar { height: 10px; border-radius: 999px; background: var(--sp-surface-soft); overflow: hidden; border: 1px solid var(--sp-border); }
.severity-track i, .bar-track i, .heatbar i { display: block; height: 100%; border-radius: inherit; }
.finding, .queue-card { margin: 14px 0; box-shadow: none; }
.finding[hidden], .queue-card[hidden], [data-view-panel][hidden] { display: none; }
.queue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--sp-muted); }
.meta span { border: 1px solid var(--sp-border); border-radius: 999px; padding: 2px 8px; background: var(--sp-surface-soft); }
.badge { border-radius: 999px; padding: 2px 8px; color: white; font-weight: 700; display: inline-block; }
.critical, .failed { background: var(--sp-critical); }
.high, .warning { background: var(--sp-high); }
.medium, .not_measured { background: var(--sp-medium); }
.low { background: var(--sp-low); }
.info { background: var(--sp-info); }
.passed { background: var(--sp-pass); }
.filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 12px 0 18px; }
.filter-grid label { display: grid; gap: 5px; color: var(--sp-muted); font-size: 13px; }
.matrix-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.compact-list { display: grid; gap: 8px; padding-left: 20px; }
.compact-list span { color: var(--sp-muted); }
.timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.timeline div { border: 1px solid var(--sp-border); border-radius: 8px; padding: 12px; background: var(--sp-surface-soft); }
.timeline span { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: white; background: var(--sp-accent); margin-bottom: 8px; }
.metric-bars { display: grid; gap: 12px; }
.metric-bar { display: grid; gap: 6px; }
.metric-bar div:first-child { display: flex; justify-content: space-between; gap: 12px; }
.heatmap { display: grid; gap: 12px; }
.heatmap-item { background: linear-gradient(90deg, rgba(37,99,235,.08), rgba(255,255,255,1) var(--heat)); }
pre { overflow: auto; background: #101820; color: #f8fafc; border: 1px solid #263241; border-radius: 8px; padding: 12px; }
code { font-family: var(--sp-mono); }
.status { color: var(--sp-pass); }
.summary-list { display: grid; gap: 8px; padding-left: 20px; }
.copy-status { margin-left: 10px; color: var(--sp-muted); font-size: 13px; }
.empty-state { color: var(--sp-muted); background: var(--sp-surface-soft); border: 1px dashed var(--sp-border); border-radius: 8px; padding: 12px; }
.evidence-drawer { border-top: 1px solid var(--sp-border); margin-top: 12px; padding-top: 10px; }
.evidence-drawer summary { cursor: pointer; font-weight: 700; }
@media (max-width: 920px) {
  .hero { display: block; }
  .score-ring.large { margin-top: 20px; }
  .layout { display: block; }
  .toc { position: static; margin-bottom: 20px; }
  .score-support, .matrix-grid { grid-template-columns: 1fr; }
  .panel-head, .queue-card-head, .metric-bar div:first-child { display: block; }
}
@media print {
  body { background: white; color: black; }
  .toc, .toolbar, .view-tabs, button { display: none; }
  .layout { display: block; padding: 0; }
  .panel, .metric, .finding, .queue-card { border-color: #ccc; box-shadow: none; }
  [data-view-panel][hidden] { display: block; }
}
`;

import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { buildPortfolio, recordDecision } from "@seo-polish/workflow";

export interface ControlCenterOptions {
  auditRoot: string;
  host?: string;
  port?: number;
  openBrowser?: boolean;
}

export interface RunningControlCenter {
  server: Server;
  url: string;
  close(): Promise<void>;
}

const REPORT_FILES = [
  "audit-run.json",
  "score.json",
  "report-dashboard.json",
  "workflow-state.json",
  "decisions.json",
  "verification-manifest.json",
  "findings.json"
] as const;

export async function startControlCenter(options: ControlCenterOptions): Promise<RunningControlCenter> {
  const auditRoot = resolve(options.auditRoot);
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    throw new Error("The unauthenticated control center can only bind to a loopback host.");
  }
  const server = createServer((request, response) => {
    handleRequest(request, response, auditRoot).catch((error) => {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4178, host, () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Control center did not bind a TCP address.");
  const url = `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`;
  if (options.openBrowser !== false) openBrowser(url);
  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose()))
      )
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auditRoot: string
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/") {
    sendText(response, 200, controlCenterHtml(), "text/html; charset=utf-8");
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/portfolio") {
    sendJson(response, 200, await buildPortfolio(auditRoot));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/runs") {
    sendJson(response, 200, { runs: await auditRuns(auditRoot) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/report") {
    const reportDir = await confinedReportPath(auditRoot, requiredQuery(url, "path"));
    const values = await Promise.all(REPORT_FILES.map((file) => readReportJson(reportDir, file)));
    sendJson(
      response,
      200,
      Object.fromEntries(
        REPORT_FILES.map((file, index) => [file.replace(/\.json$/, "").replace(/-/g, "_"), values[index]])
      )
    );
    return;
  }
  if (request.method === "GET" && url.pathname === "/artifact") {
    const reportDir = await confinedReportPath(auditRoot, requiredQuery(url, "report"));
    const file = requiredQuery(url, "file");
    if (!new Set(["index.html", "index.md", "final-audit.md", "priority-action-plan.md"]).has(file)) {
      throw new Error(`Artifact is not available through the control center: ${file}`);
    }
    const content = await readFile(await confinedFilePath(reportDir, join(reportDir, file)), "utf8");
    sendText(
      response,
      200,
      content,
      file.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8"
    );
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/decision") {
    assertSameOriginJsonRequest(request);
    const body = await readJsonBody<{
      reportDir?: string;
      decisionId?: string;
      status?: "approved" | "rejected" | "deferred";
      selectedOption?: string;
      note?: string;
    }>(request);
    if (!body.reportDir || !body.decisionId || !body.status)
      throw new Error("reportDir, decisionId and status are required.");
    const reportDir = await confinedReportPath(auditRoot, body.reportDir);
    const state = await recordDecision({
      statePath: reportDir,
      decisionId: body.decisionId,
      status: body.status,
      ...(body.selectedOption ? { selectedOption: body.selectedOption } : {}),
      ...(body.note ? { note: body.note } : {}),
      decidedBy: "control-center-owner"
    });
    sendJson(response, 200, state);
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}

async function auditRuns(auditRoot: string): Promise<Array<Record<string, unknown>>> {
  const index = await readOptionalJson<{ runs?: Array<Record<string, unknown>> }>(
    join(auditRoot, "audit-index.json")
  );
  if (Array.isArray(index?.runs)) return enrichAuditRuns(auditRoot, [...index.runs].sort(runSort));
  const runs: Array<Record<string, unknown>> = [];
  for (const site of await readdir(auditRoot, { withFileTypes: true }).catch(() => [])) {
    if (!site.isDirectory() || site.name.startsWith(".")) continue;
    for (const run of await readdir(join(auditRoot, site.name), { withFileTypes: true }).catch(() => [])) {
      if (!run.isDirectory()) continue;
      const reportDir = join(auditRoot, site.name, run.name);
      const metadata = await readOptionalJson<Record<string, unknown>>(join(reportDir, "audit-run.json"));
      if (metadata) runs.push({ ...metadata, reportPath: metadata["reportPath"] ?? reportDir });
    }
  }
  return enrichAuditRuns(auditRoot, runs.sort(runSort));
}

async function enrichAuditRuns(
  auditRoot: string,
  runs: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    runs.map(async (run) => {
      const reportPath = String(run["reportPath"] ?? "");
      if (!reportPath) return run;
      let reportDir: string;
      try {
        reportDir = await confinedReportPath(auditRoot, reportPath);
      } catch {
        return run;
      }
      const workflow = await readReportJson<{ status?: string; mode?: string }>(
        reportDir,
        "workflow-state.json"
      );
      return workflow
        ? { ...run, workflowStatus: workflow.status ?? "unknown", workflowMode: workflow.mode ?? "unknown" }
        : run;
    })
  );
}

function runSort(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(right["completedAt"] ?? "").localeCompare(String(left["completedAt"] ?? ""));
}

async function confinedReportPath(auditRoot: string, input: string): Promise<string> {
  const candidates = isAbsolute(input)
    ? [resolve(input)]
    : [resolve(process.cwd(), input), resolve(auditRoot, input)];
  const root = await realpath(auditRoot).catch(() => resolve(auditRoot));
  for (const candidate of candidates) {
    if (!isWithin(auditRoot, candidate)) continue;
    const reportDir = await realpath(candidate).catch(() => null);
    if (reportDir && isWithin(root, reportDir)) return reportDir;
  }
  throw new Error("Report path is outside the configured audit root or is not readable.");
}

function isWithin(rootInput: string, targetInput: string): boolean {
  const root = resolve(rootInput);
  const target = resolve(targetInput);
  return target === root || (!relative(root, target).startsWith("..") && target.startsWith(`${root}${sep}`));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 64_000) throw new Error("Request body exceeds 64 KB.");
  }
  return JSON.parse(body) as T;
}

function assertSameOriginJsonRequest(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host || origin !== `http://${host}`) {
    throw new Error("Control center changes require a same-origin request.");
  }
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new Error("Control center changes require application/json.");
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readReportJson<T = unknown>(reportDir: string, file: string): Promise<T | null> {
  try {
    return readOptionalJson<T>(await confinedFilePath(reportDir, join(reportDir, file)));
  } catch {
    return null;
  }
}

async function confinedFilePath(root: string, path: string): Promise<string> {
  const [realRoot, realPath] = await Promise.all([realpath(root), realpath(path)]);
  if (!isWithin(realRoot, realPath)) throw new Error("Artifact path escapes the selected report.");
  return realPath;
}

async function readOptionalJson<T = unknown>(path: string): Promise<T | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function requiredQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value) throw new Error(`Missing query parameter: ${key}`);
  return value;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  sendText(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8");
}

function sendText(response: ServerResponse, status: number, value: string, contentType: string): void {
  if (response.headersSent) return;
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'"
  });
  response.end(value);
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}

function controlCenterHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SEO Polish Control Center</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0d12;--panel:#111720;--panel2:#151e29;--line:#283545;--text:#eef4fc;--muted:#93a4b8;--accent:#7dd3fc;--good:#86efac;--warn:#fde68a;--bad:#fca5a5}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}button,select,input{font:inherit}button{cursor:pointer}.shell{max-width:1440px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;gap:24px;align-items:end;min-width:0;margin-bottom:24px}.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.12em;font-size:11px}.top h1{font-size:28px;margin:4px 0;overflow-wrap:anywhere}.top p{color:var(--muted);margin:0}.layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px}.layout>*,.panel,.metric{min-width:0}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}.sidebar{position:sticky;top:18px;align-self:start;max-height:calc(100vh - 36px);overflow:auto}.run{width:100%;text-align:left;overflow-wrap:anywhere;padding:12px;margin:0 0 8px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px}.run:hover,.run.active{border-color:var(--accent)}.run small{display:block;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px}.metric strong{display:block;font-size:24px}.metric span{color:var(--muted);overflow-wrap:anywhere}h2{font-size:17px;margin:0 0 14px}.section{margin-top:18px}.phases{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.phase{min-width:0;overflow-wrap:anywhere;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}.phase.complete{border-color:#245c3b}.phase.blocked,.phase.failed{border-color:#6f3535}.phase small{color:var(--muted);display:block}.decision{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:14px 0;border-top:1px solid var(--line)}.decision:first-child{border-top:0}.actions{display:flex;flex-wrap:wrap;gap:6px;align-items:start}.actions button,.link{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:8px;padding:7px 10px;text-decoration:none}.actions button:hover,.link:hover{border-color:var(--accent)}table{display:block;width:100%;overflow-x:auto;border-collapse:collapse}th,td{text-align:left;padding:9px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500}.severity-critical,.severity-high{color:var(--bad)}.severity-medium{color:var(--warn)}.status{display:inline-block;border:1px solid var(--line);padding:2px 7px;border-radius:999px}.empty{color:var(--muted);padding:24px 0}.footer{color:var(--muted);margin-top:18px}@media(max-width:900px){.shell{padding:18px}.top{align-items:flex-start;flex-direction:column}.layout{grid-template-columns:minmax(0,1fr)}.sidebar{position:static;max-height:none}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.phases{grid-template-columns:repeat(2,minmax(0,1fr))}.decision{grid-template-columns:minmax(0,1fr)}}@media(max-width:460px){.top h1{font-size:25px}.grid{grid-template-columns:minmax(0,1fr)}}
  </style>
</head>
<body><div class="shell">
  <header class="top"><div><div class="eyebrow">Local-first audit operations</div><h1>SEO Polish Control Center</h1><p>Projects, runs, evidence coverage, decisions and verification.</p></div><div id="portfolio"></div></header>
  <div class="layout"><aside class="panel sidebar"><h2>Audit runs</h2><div id="runs" class="empty">Loading…</div></aside><main><section class="panel" id="main"><div class="empty">Select an audit run.</div></section></main></div>
  <p class="footer">Local only. No cloud upload, authenticated crawling or repository mutation is performed by this surface.</p>
</div>
<script>
  var selectedPath = null;
  var runs = [];
  function el(tag, cls, text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
  function value(v,fallback){return v===null||v===undefined?fallback:v}
  async function json(url, options){var response=await fetch(url,options);var body=await response.json();if(!response.ok)throw new Error(body.error||response.statusText);return body}
  async function load(){var data=await Promise.all([json('/api/portfolio'),json('/api/runs')]);renderPortfolio(data[0]);runs=data[1].runs||[];renderRuns();if(runs[0])selectRun(runs[0].reportPath)}
  function renderPortfolio(p){var box=document.getElementById('portfolio');box.innerHTML='';var s=el('span','status',p.totals.targets+' target'+(p.totals.targets===1?'':'s')+' · '+p.totals.runs+' runs');box.appendChild(s)}
  function renderRuns(){var box=document.getElementById('runs');box.innerHTML='';if(!runs.length){box.className='empty';box.textContent='No audit runs found.';return}runs.forEach(function(run){var b=el('button','run'+(run.reportPath===selectedPath?' active':''));var status=run.workflowStatus?'workflow '+run.workflowStatus+' · report gate '+String(run.qualityGateStatus||'unknown'):'report gate '+String(run.qualityGateStatus||'unknown');b.appendChild(el('strong','',run.auditName||run.auditSlug||run.targetUrl));b.appendChild(el('small','',String(run.score)+'/100 · '+status+' · '+String(run.completedAt||'')));b.onclick=function(){selectRun(run.reportPath)};box.appendChild(b)})}
  async function selectRun(path){selectedPath=path;renderRuns();var data=await json('/api/report?path='+encodeURIComponent(path));renderReport(data,path)}
  function metric(label,val,note){var n=el('div','metric');n.appendChild(el('strong','',val));n.appendChild(el('span','',label+(note?' · '+note:'')));return n}
  function renderReport(data,path){var main=document.getElementById('main');main.innerHTML='';var score=data.score||{};var workflow=data.workflow_state||{};var verification=data.verification_manifest||{};var grid=el('div','grid');grid.appendChild(metric('Core SEO',value(score.total,'—'),value(score.level,'')));grid.appendChild(metric('Agent experimental',value(score.experimentalCombined,'—'),'separate'));grid.appendChild(metric('Coverage',score.coverage?score.coverage.percentMeasured+'%':'—','applicable rules'));grid.appendChild(metric('Workflow',value(workflow.status,'legacy run'),value(workflow.mode,'')));main.appendChild(grid);var links=el('div','section');var report=el('a','link','Open full report');report.href='/artifact?report='+encodeURIComponent(path)+'&file=index.html';report.target='_blank';links.appendChild(report);main.appendChild(links);renderPhases(main,workflow.phases||[]);renderDecisions(main,data.decisions||workflow.decisions||[],path);renderFindings(main,data.findings||[]);if(verification.stopReasons&&verification.stopReasons.length){var stop=el('section','panel section');stop.appendChild(el('h2','','Verification attention'));stop.appendChild(el('p','severity-high',verification.stopReasons.join(' · ')));main.appendChild(stop)}}
  function renderPhases(main,phases){var section=el('section','panel section');section.appendChild(el('h2','','Workflow phases'));var row=el('div','phases');if(!phases.length)row.appendChild(el('div','empty','This predates guided workflow state.'));phases.forEach(function(p){var n=el('div','phase '+p.status);n.appendChild(el('strong','',p.id.replaceAll('_',' ')));n.appendChild(el('small','',p.status));n.title=p.message||'';row.appendChild(n)});section.appendChild(row);main.appendChild(section)}
  function renderDecisions(main,decisions,path){var section=el('section','panel section');section.appendChild(el('h2','','Approval inbox'));if(!decisions.length)section.appendChild(el('div','empty','No decisions recorded for this run.'));var labels={approved:'Approve',rejected:'Reject',deferred:'Defer'};decisions.forEach(function(d){var row=el('div','decision');var copy=el('div');copy.appendChild(el('strong','',d.title));copy.appendChild(el('div','',d.reason));copy.appendChild(el('small','status',d.status));row.appendChild(copy);var actions=el('div','actions');['approved','rejected','deferred'].forEach(function(status){var b=el('button','',labels[status]);b.disabled=d.status!=='pending';b.onclick=function(){decide(path,d.id,status)};actions.appendChild(b)});row.appendChild(actions);section.appendChild(row)});main.appendChild(section)}
  async function decide(path,id,status){await json('/api/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reportDir:path,decisionId:id,status:status})});await selectRun(path)}
  function renderFindings(main,findings){var section=el('section','panel section');section.appendChild(el('h2','','Evidence-backed findings'));if(!findings.length){section.appendChild(el('div','empty','No findings.'));main.appendChild(section);return}var table=el('table');var head=el('tr');['Severity','Finding','Scope','Evidence'].forEach(function(v){head.appendChild(el('th','',v))});table.appendChild(head);findings.slice(0,100).forEach(function(f){var row=el('tr');row.appendChild(el('td','severity-'+f.severity,f.severity));row.appendChild(el('td','',f.id+' · '+f.title));row.appendChild(el('td','',(f.affectedTemplates||[]).join(', ')||(f.affectedUrls||[]).length+' URLs'));row.appendChild(el('td','',String((f.evidence||[]).length)));table.appendChild(row)});section.appendChild(table);main.appendChild(section)}
  load().catch(function(error){document.getElementById('main').textContent=error.message});
</script></body></html>`;
}

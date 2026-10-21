import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_OUT_DIR, DEFAULT_STATE_DIR } from "./config";
import { envFromProcess, readEvent, resolveTrigger } from "./context/resolve";
import { runPipeline } from "./pipeline";
import { GitHub } from "./publish/github";
import { renderMarkdown } from "./publish/report-md";
import { StateStore } from "./state/store";
import type { Report, Viewport } from "./types";

const USAGE = `DS-аудит Яндекс Мед

  npm run ds:audit -- --url <url> [--routes /a,/b] [--no-ai] [--no-crawl]
                      [--out ${DEFAULT_OUT_DIR}] [--state-dir ${DEFAULT_STATE_DIR}]
                      [--commit-sha <sha>] [--base-sha <sha>] [--baseline <report.json>] [--base-url <url>]
                      [--mode manual|baseline|deep] [--save-baseline] [--viewports desktop,mobile] [--fail-on-gate]

  npm run ds:audit -- ci      запуск из GitHub Actions (repository_dispatch / workflow_dispatch)
`;

function summary(report: Report): string {
  return [
    `gate: ${report.gate.state}${report.gate.advisory ? " (advisory)" : ""} — ${report.gate.description}`,
    `NEW ${report.count_new} · EXISTING ${report.count_existing} · FIXED ${report.count_fixed} · baseline ${report.baseline_status}`,
    `ds ${report.ds_version} · ruleset ${report.ruleset_version} · auditor ${report.auditor_version}`,
  ].join("\n");
}

/** A baseline with pages that did not load would turn those failures into EXISTING debt: refuse it. */
function assertBaselineUsable(report: Report) {
  if (report.page_errors.length) {
    throw new Error(`Базовый отчёт не сохранён: не загрузились ${report.page_errors.length} страниц (${report.page_errors.slice(0, 3).map(e => `${e.route} ${e.viewport}: ${e.error}`).join("; ")})`);
  }
}

async function local(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" }, routes: { type: "string" }, "no-ai": { type: "boolean", default: false }, "no-crawl": { type: "boolean", default: false },
      out: { type: "string", default: DEFAULT_OUT_DIR }, "state-dir": { type: "string" }, "commit-sha": { type: "string" }, "base-sha": { type: "string" },
      baseline: { type: "string" }, "base-url": { type: "string" }, mode: { type: "string", default: "manual" }, "save-baseline": { type: "boolean", default: false },
      viewports: { type: "string" }, "fail-on-gate": { type: "boolean", default: false }, help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.help || !values.url) { process.stdout.write(USAGE); process.exit(values.help ? 0 : 2); }
  const mode = (["manual", "baseline", "deep"].includes(values.mode as string) ? values.mode : "manual") as Report["mode"];
  const store = values["state-dir"] ? new StateStore(values["state-dir"]) : null;
  const result = await runPipeline({
    url: values.url as string,
    routes: values.routes ? values.routes.split(",").map(r => r.trim()).filter(Boolean) : undefined,
    crawl: !values["no-crawl"],
    viewports: values.viewports ? values.viewports.split(",") as Viewport[] : undefined,
    outDir: values.out as string,
    mode,
    commitSha: values["commit-sha"] ?? null,
    baseSha: values["base-sha"] ?? null,
    baselineFile: values.baseline ?? null,
    baseUrl: values["base-url"] ?? null,
    store,
    noAi: values["no-ai"] as boolean,
  });
  if ((values["save-baseline"] || mode === "baseline") && store) {
    assertBaselineUsable(result.report);
    store.saveBaseline(result.report);
  }
  if (result.baselineNote) process.stderr.write(`baseline: ${result.baselineNote}\n`);
  process.stdout.write(`${summary(result.report)}\nreport: ${path.join(values.out as string, "report.md")}\n`);
  if (values["fail-on-gate"] && result.report.gate.state === "failure") process.exit(1);
}

/** GitHub Actions entry: resolve the trigger, audit, compare, comment, set the commit status. */
async function ci() {
  const env = envFromProcess();
  const trigger = resolveTrigger(env, readEvent(env));
  const outDir = process.env.DS_AUDIT_OUT_DIR || DEFAULT_OUT_DIR;
  const store = new StateStore(process.env.DS_AUDIT_STATE_DIR || DEFAULT_STATE_DIR);
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  mkdirSync(outDir, { recursive: true });
  const note = (text: string) => { process.stdout.write(`${text}\n`); writeFileSync(path.join(outDir, "skipped.txt"), `${text}\n`); };

  if (trigger.kind === "ignored") return note(`Пропуск: ${trigger.reason}`);
  const now = new Date().toISOString();

  if (trigger.kind === "production" || (trigger.kind === "manual" && trigger.mode === "baseline")) {
    const sha = trigger.sha as string;
    store.recordDeployment({ sha, url: trigger.url, environment: "production", project: trigger.kind === "production" ? trigger.project : null, observed_at: now });
    const { report } = await runPipeline({ url: trigger.url, routes: trigger.kind === "manual" && trigger.routes.length ? trigger.routes : undefined, outDir, mode: "baseline", commitSha: sha, baseSha: null, store, noAi: true, runUrl });
    assertBaselineUsable(report);
    store.saveBaseline(report);
    store.prune();
    return note(`Базовый отчёт для ${sha.slice(0, 7)} сохранён\n${summary(report)}`);
  }

  const github = GitHub.fromEnv();
  let pr: number | null = null;
  let headSha: string | null = null;
  let baseSha: string | null = null;
  let routes: string[] | undefined;
  let mode: Report["mode"] = "preview";

  if (trigger.kind === "preview") {
    store.recordDeployment({ sha: trigger.sha, url: trigger.url, environment: "preview", project: trigger.project, observed_at: now });
    const repo = process.env.GITHUB_REPOSITORY;
    const pulls = (await github.pullsForCommit(trigger.sha)).filter(p => p.state === "open" && p.head.sha === trigger.sha && p.base.repo.full_name === repo).sort((a, b) => a.number - b.number);
    if (!pulls.length) { store.prune(); return note(`Для ${trigger.sha.slice(0, 7)} нет открытого PR с этим head — деплой записан, аудит не нужен`); }
    pr = pulls[0].number;
    headSha = trigger.sha;
    baseSha = await github.mergeBase(pulls[0].base.ref, trigger.sha);
  } else {
    mode = trigger.mode;
    pr = trigger.pr;
    headSha = trigger.sha;
    baseSha = trigger.baseSha;
    routes = trigger.routes.length ? trigger.routes : undefined;
  }

  if (headSha && pr) await github.setStatus(headSha, "pending", "DS-аудит идёт", runUrl);
  try {
    const { report } = await runPipeline({ url: trigger.url, routes, outDir, mode, commitSha: headSha, baseSha, store, noAi: true, runUrl });
    if (pr) await github.upsertComment(pr, renderMarkdown(report, { limit: 60, runUrl }));
    if (headSha && pr) await github.setStatus(headSha, report.gate.state, report.gate.description, runUrl);
    store.prune();
    process.stdout.write(`${summary(report)}\n`);
  } catch (error) {
    if (headSha && pr) await github.setStatus(headSha, "error", `Аудит не завершился: ${String(error instanceof Error ? error.message : error).slice(0, 100)}`, runUrl).catch(() => undefined);
    throw error;
  }
}

const [command, ...rest] = process.argv.slice(2);
const main = command === "ci" ? ci() : local(command === "audit" ? rest : process.argv.slice(2));
main.catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exit(1); });

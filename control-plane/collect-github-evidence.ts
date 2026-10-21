import fs from "node:fs";
import path from "node:path";
import type { GateResult, GateStatus } from "./lib/model";

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  created_at: string;
}

interface WorkflowRunsResponse { workflow_runs: WorkflowRun[] }
interface WorkflowStep { name: string; status: string; conclusion: string | null }
interface WorkflowJob { name: string; status: string; conclusion: string | null; steps?: WorkflowStep[] }
interface JobsResponse { jobs: WorkflowJob[] }
interface CommitStatus { context: string; state: "error" | "failure" | "pending" | "success"; description?: string | null; target_url?: string | null }
interface CombinedStatus { statuses: CommitStatus[] }
interface CheckRun { name: string; status: string; conclusion: string | null; app?: { slug?: string | null } | null; details_url?: string | null }
interface CheckRunsResponse { check_runs: CheckRun[] }

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

const repo = arg("repo", process.env.GITHUB_REPOSITORY ?? "");
const sha = arg("candidate-sha", process.env.GITHUB_SHA ?? "");
const out = arg("out", "control-plane-evidence.json");
const token = process.env.GITHUB_TOKEN;
if (!repo || !sha) throw new Error("repo and candidate SHA are required");
if (!token) throw new Error("GITHUB_TOKEN is required");

async function github<T>(endpoint: string): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kardio-control-plane",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${endpoint}`);
  return await response.json() as T;
}

function gate(gateName: string, status: GateStatus, source: string, summary?: string): GateResult {
  return { gate: gateName, status, candidate_sha: sha, source, ...(summary ? { summary } : {}) };
}

function groupGate(name: string, steps: WorkflowStep[], predicates: Array<(step: WorkflowStep) => boolean>): GateResult {
  const matched = predicates.map(predicate => steps.find(predicate)).filter((item): item is WorkflowStep => Boolean(item));
  if (matched.length !== predicates.length) {
    return gate(name, "MISSING", "github-actions/Product quality", `expected ${predicates.length} steps, found ${matched.length}`);
  }
  const failed = matched.filter(step => step.conclusion && step.conclusion !== "success");
  if (failed.length) {
    return gate(name, "FAIL", "github-actions/Product quality", failed.map(step => `${step.name}:${step.conclusion}`).join(" | "));
  }
  if (matched.every(step => step.status === "completed" && step.conclusion === "success")) {
    return gate(name, "PASS", "github-actions/Product quality", matched.map(step => step.name).join(" | "));
  }
  return gate(name, "MISSING", "github-actions/Product quality", "required CI steps are not complete");
}

async function productQualityEvidence(): Promise<GateResult[]> {
  const runs = await github<WorkflowRunsResponse>(`/repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100`);
  const candidates = runs.workflow_runs
    .filter(run => run.name === "Product quality" && run.head_sha === sha)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const run = candidates[0];
  if (!run) return [];
  const jobs = await github<JobsResponse>(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  const verify = jobs.jobs.find(job => job.name === "verify") ?? jobs.jobs[0];
  const steps = verify?.steps ?? [];
  if (!steps.length) return [];

  const has = (needle: string) => (step: WorkflowStep) => step.name.includes(needle);
  const exact = (name: string) => (step: WorkflowStep) => step.name === name;

  return [
    groupGate("static", steps, [has("data:validate"), has("typecheck"), has("lint"), has("npm audit"), has("npm run build")]),
    groupGate("migration", steps, [has("db:migrate"), exact("Run npm run db:seed"), exact("Verify idempotent import")]),
    groupGate("unit", steps, [exact("Run npm test")]),
    groupGate("integration", steps, [has("test:integration")]),
    groupGate("simulation", steps, [exact("Run environment simulations")]),
    groupGate("e2e", steps, [has("test:e2e")]),
  ];
}

async function dsEvidence(): Promise<GateResult[]> {
  const combined = await github<CombinedStatus>(`/repos/${repo}/commits/${sha}/status`);
  const status = combined.statuses.find(item => item.context === "ds-audit/regression");
  if (!status) return [];
  const mapped: GateStatus = status.state === "success" ? "PASS" : status.state === "pending" ? "MISSING" : "FAIL";
  return [gate("ds_audit", mapped, "github-status/ds-audit/regression", status.description ?? undefined)];
}

async function previewEvidence(): Promise<GateResult[]> {
  const checks = await github<CheckRunsResponse>(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`);
  const vercel = checks.check_runs.filter(check => check.app?.slug === "vercel" || /vercel/iu.test(check.name));
  if (!vercel.length) return [];
  const failed = vercel.filter(check => check.status === "completed" && check.conclusion !== "success" && check.conclusion !== "neutral" && check.conclusion !== "skipped");
  if (failed.length) return [gate("preview", "FAIL", "github-checks/vercel", failed.map(check => `${check.name}:${check.conclusion}`).join(" | "))];
  if (vercel.some(check => check.status !== "completed")) return [gate("preview", "MISSING", "github-checks/vercel", "preview check still running")];
  return [gate("preview", "PASS", "github-checks/vercel", vercel.map(check => check.name).join(" | "))];
}

const gates = [
  ...(await productQualityEvidence()),
  ...(await dsEvidence()),
  ...(await previewEvidence()),
];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ gates }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ gates }, null, 2));

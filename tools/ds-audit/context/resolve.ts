import { readFileSync } from "node:fs";

/**
 * What triggered the run. Only two events are accepted:
 * - repository_dispatch `vercel.deployment.success` from the Vercel GitHub integration;
 * - workflow_dispatch with an explicit url (manual fallback, deep mode, baseline seeding).
 * The payload is validated before its URL is opened: Vercel project and host must match.
 */
export type Trigger =
  | { kind: "preview"; url: string; sha: string; project: string; deploymentId: string | null }
  | { kind: "production"; url: string; sha: string; project: string; deploymentId: string | null }
  | { kind: "manual"; mode: "manual" | "deep" | "baseline"; url: string; sha: string | null; baseSha: string | null; pr: number | null; routes: string[] }
  | { kind: "ignored"; reason: string };

export interface ResolveEnv {
  eventName: string | undefined;
  eventPath: string | undefined;
  /** Vercel project name expected in the payload (repository variable DS_AUDIT_VERCEL_PROJECT). */
  project: string;
  /** Optional Vercel project id (repository variable VERCEL_PROJECT_ID). */
  projectId: string | null;
  productionRef: string;
  /** Extra allowed hosts besides *.vercel.app, comma separated. */
  allowedHosts: string[];
}

export function envFromProcess(): ResolveEnv {
  return {
    eventName: process.env.GITHUB_EVENT_NAME,
    eventPath: process.env.GITHUB_EVENT_PATH,
    project: process.env.DS_AUDIT_VERCEL_PROJECT || "kardio",
    projectId: process.env.VERCEL_PROJECT_ID || null,
    productionRef: process.env.DS_AUDIT_PRODUCTION_REF || "main",
    allowedHosts: (process.env.DS_AUDIT_ALLOWED_HOSTS || "").split(",").map(h => h.trim()).filter(Boolean),
  };
}

export function normalizeUrl(raw: string): string {
  const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  return url.origin;
}

function hostAllowed(url: string, env: ResolveEnv): boolean {
  const host = new URL(url).hostname;
  return (host.endsWith(".vercel.app") && !host.includes("..")) || env.allowedHosts.includes(host) || host === "127.0.0.1" || host === "localhost";
}

const SHA = /^[0-9a-f]{7,40}$/;

interface DispatchPayload {
  url?: string; id?: string; environment?: string;
  state?: { type?: string };
  project?: { name?: string; id?: string };
  git?: { ref?: string; sha?: string };
}

export function resolveTrigger(env: ResolveEnv, event: Record<string, unknown>): Trigger {
  if (env.eventName === "repository_dispatch") {
    if (event.action !== "vercel.deployment.success") return { kind: "ignored", reason: `Событие ${String(event.action)} не обрабатывается` };
    const p = (event.client_payload ?? {}) as DispatchPayload;
    if (!p.url || !p.git?.sha || !SHA.test(p.git.sha)) return { kind: "ignored", reason: "В payload нет url или git.sha" };
    if (p.state?.type && p.state.type !== "success") return { kind: "ignored", reason: `Состояние деплоя ${p.state.type}` };
    if (p.project?.name !== env.project) return { kind: "ignored", reason: `Проект ${p.project?.name} не ${env.project}` };
    if (env.projectId && p.project?.id !== env.projectId) return { kind: "ignored", reason: "project.id не совпадает с VERCEL_PROJECT_ID" };
    const url = normalizeUrl(p.url);
    if (!hostAllowed(url, env)) return { kind: "ignored", reason: `Хост ${new URL(url).hostname} не разрешён` };
    const common = { url, sha: p.git.sha, project: p.project.name, deploymentId: p.id ?? null };
    if (p.environment === "production") {
      return p.git.ref === env.productionRef ? { kind: "production", ...common } : { kind: "ignored", reason: `Production-деплой не из ${env.productionRef}` };
    }
    if (p.environment === "preview") return { kind: "preview", ...common };
    return { kind: "ignored", reason: `Окружение ${p.environment} не обрабатывается` };
  }
  if (env.eventName === "workflow_dispatch") {
    const inputs = (event.inputs ?? {}) as Record<string, string | undefined>;
    if (!inputs.url) return { kind: "ignored", reason: "workflow_dispatch без url" };
    const url = normalizeUrl(inputs.url);
    if (!hostAllowed(url, env)) return { kind: "ignored", reason: `Хост ${new URL(url).hostname} не разрешён` };
    const mode = inputs.mode === "deep" || inputs.mode === "baseline" ? inputs.mode : "manual";
    const sha = inputs.sha && SHA.test(inputs.sha) ? inputs.sha : null;
    const baseSha = inputs.base_sha && SHA.test(inputs.base_sha) ? inputs.base_sha : null;
    const pr = inputs.pr_number && /^\d+$/.test(inputs.pr_number) ? Number(inputs.pr_number) : null;
    if (mode === "baseline" && !sha) return { kind: "ignored", reason: "Для mode=baseline нужен sha" };
    const routes = (inputs.routes ?? "").split(",").map(r => r.trim()).filter(r => r.startsWith("/"));
    return { kind: "manual", mode, url, sha, baseSha, pr, routes };
  }
  return { kind: "ignored", reason: `Событие ${env.eventName ?? "—"} не обрабатывается` };
}

export function readEvent(env: ResolveEnv): Record<string, unknown> {
  if (!env.eventPath) return {};
  return JSON.parse(readFileSync(env.eventPath, "utf8")) as Record<string, unknown>;
}

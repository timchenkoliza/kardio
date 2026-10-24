"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import type { PortalJob } from "@/lib/portal/jobs";
import { useWorkspace } from "@/components/workspace/workspace-provider";

interface StatusPayload {
  availability: "available" | "run_not_found" | "session_mismatch";
  phase: string | null;
  finished: boolean;
  manifestVersion: number;
  progress: { stepsDone: number; stepsTotal: number; pending: Array<{ name: string; slow: boolean }> } | null;
}

/** Polling backs off to this interval; the result page never waits on a held-open request. */
const INTERVALS = [700, 1000, 1000, 1500, 2000, 2500, 3000];
/** After this long the page stops implying that the result is about to arrive. */
const PATIENCE_MS = 120_000;

/**
 * Durable progress of a run on the result page. Reads the run's stored
 * status; when a new validated manifest version (an ExperiencePatch) is
 * stored, the server-rendered interior is refreshed in place — the shell, the
 * input and already shown modules keep their identity and state. Closing or
 * reloading the page loses nothing: the run lives in storage.
 */
export function RunProgress({ runId, specialty, version, phase, pending, startedAt }: {
  runId: string;
  specialty: SpecialtyId;
  version: number;
  phase: string;
  pending: Array<{ name: string; slow: boolean }>;
  startedAt: string;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [state, setState] = useState({ pending, offline: false, overdue: false });
  const seen = useRef({ version, phase });

  useEffect(() => {
    seen.current = { version, phase };
  }, [version, phase]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let attempt = 0;
    let failures = 0;
    const tick = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/agents/runs/${encodeURIComponent(runId)}?specialty=${specialty}`, { cache: "no-store" });
        const payload = await response.json() as StatusPayload;
        failures = 0;
        if (cancelled) return;
        const overdue = Date.now() - Date.parse(startedAt) > PATIENCE_MS;
        setState({ pending: payload.progress?.pending ?? [], offline: false, overdue });
        const changed = payload.manifestVersion !== seen.current.version || payload.phase !== seen.current.phase;
        if (payload.availability !== "available" || payload.finished || changed) {
          seen.current = { version: payload.manifestVersion, phase: payload.phase ?? seen.current.phase };
          startRefresh(() => router.refresh());
        }
        if (payload.availability !== "available" || payload.finished) return;
      } catch {
        failures += 1;
        if (!cancelled) setState(current => ({ ...current, offline: failures >= 2 }));
      }
      attempt += 1;
      timer = window.setTimeout(() => void tick(), INTERVALS[Math.min(attempt, INTERVALS.length - 1)]);
    };
    timer = window.setTimeout(() => void tick(), INTERVALS[0]);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [router, runId, specialty, startedAt]);

  const names = state.pending.map(item => item.slow ? `${item.name} (отвечает медленно)` : item.name);
  const started = phase === "queued" || (phase === "running" && version === 0);
  return <div className="ws-catchup" role="status" aria-live="polite" data-run-progress={phase}>
    <Loader2 size={14} className="ws-spin" aria-hidden="true" />
    <span>
      {state.offline
        ? "Нет связи с сервером. Результат сохранён — проверим снова, когда связь восстановится."
        : `${started ? "Понимаем запрос и проверяем источники" : "Продолжаем проверять источники"}${names.length ? `: ${names.join(", ")}.` : "…"}`}
      {state.overdue && " Проверка идёт дольше обычного."}
    </span>
    {state.overdue && <button type="button" className="ws-button is-small" onClick={() => startRefresh(() => router.refresh())}><RefreshCw size={13} aria-hidden="true" />Обновить</button>}
  </div>;
}

/** Re-asks the same question as a new run (a failed or expired run is kept as it was). */
export function RetryRun({ text, job, contextRunId }: { text: string; job: PortalJob | null; contextRunId?: string }) {
  const router = useRouter();
  const { command } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [failed, setFailed] = useState(false);
  async function retry() {
    setBusy(true);
    setFailed(false);
    // Quiet: the failure is said here, next to the button, not in a second toast.
    const result = await command({ action: "ask", text, ...(job ? { job } : {}), ...(contextRunId ? { contextRunId, followup: true } : {}) }, { refresh: false, quiet: true, timeoutMs: 20_000 });
    setBusy(false);
    if (!result?.runId) { setFailed(true); return; }
    startNavigation(() => router.push(result.redirect ?? `?run=${encodeURIComponent(result.runId!)}`));
  }
  return <div className="pt-card-actions">
    <button type="button" className="ws-button pt-retry" disabled={busy || navigating} onClick={() => void retry()}>
      {busy || navigating ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}Повторить
    </button>
    {failed && <span className="ws-risk is-blocking" role="alert">Не удалось запустить поиск</span>}
  </div>;
}

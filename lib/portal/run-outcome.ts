import type { AgentRun } from "@/lib/agents/types";

/**
 * What a finished run actually established, in words a physician reads the
 * same way every time. «Готово» is said only when something was found; a
 * search that found nothing, a search that never ran (nothing to search for)
 * and a source that did not answer are different states — never one «Готово».
 */
export type RunOutcomeKind = "running" | "found" | "partial" | "not_found" | "not_run" | "source_error" | "failed" | "blocked";

export interface RunOutcome {
  kind: RunOutcomeKind;
  label: string;
  /** One sentence: what it means and what to do; null when the label says it all. */
  note: string | null;
  /** Tone of the status tag: `ok` / `neutral` / `warning` / `danger`. */
  tone: "ok" | "neutral" | "warning" | "danger";
  /** A repeat can help (network, timeout); not when the source page changed or refuses automated reading. */
  retryable?: boolean;
}

/** Failures a repeat will not fix: the source page changed its structure or closed automated reading. */
const STRUCTURAL = /структура страницы|изменилась|robots|закрыт\p{L}* для автоматическ/iu;

/** A tool note for a source the physician excluded: not a failure, nothing to repeat. */
export const EXCLUDED_IN_PROFILE = /исключ[её]н в (?:ваших источниках|вашем профиле)/iu;

/** Tool notes and steps that mean nothing could be searched for (no topic, no recognised term). */
const NOTHING_TO_SEARCH = /нет тем для поиска|нет распознанных терминов|не распознаны заболевание|тема не распознана/iu;

export function runOutcome(run: Pick<AgentRun, "status" | "plan" | "toolsUsed" | "resultIds" | "experience" | "error">, options: { monitoring?: boolean } = {}): RunOutcome {
  if (run.status === "queued" || run.status === "running") return { kind: "running", label: "Выполняется", note: null, tone: "neutral" };
  if (run.status === "blocked") return { kind: "blocked", label: "Остановлено проверкой безопасности", note: null, tone: "warning" };
  if (run.status === "failed" && run.error === "execution_expired") return { kind: "failed", label: "Не завершено", note: "Выполнение прервалось. Запустите ещё раз.", tone: "danger" };
  if (run.status === "failed") return { kind: "failed", label: "Ошибка выполнения", note: "Результат не установлен. Запустите ещё раз.", tone: "danger" };

  const graph = run.experience?.graph ?? null;
  const found = graph ? graph.documents.length : run.resultIds.length;
  const sourceFailed = graph
    ? graph.sources.some(source => source.invoked && (source.outcome === "failed" || source.outcome === "unavailable"))
    : run.toolsUsed.some(tool => (tool.status === "failed" || tool.status === "unavailable") && !EXCLUDED_IN_PROFILE.test(tool.note ?? ""));
  const searched = graph
    ? graph.sources.some(source => source.invoked && (source.outcome === "ok" || source.outcome === "empty"))
    : run.toolsUsed.some(tool => tool.status === "ok" || (tool.status === "partial" && !NOTHING_TO_SEARCH.test(tool.note ?? "")));
  // The executor's own last step says «no search» explicitly; older runs only have the tool note.
  const planNotRun = run.plan.some(step => step.status === "skipped" && NOTHING_TO_SEARCH.test(`${step.label} ${step.detail ?? ""}`));
  const nothingToSearch = planNotRun || (run.toolsUsed.some(tool => NOTHING_TO_SEARCH.test(tool.note ?? "")) && !searched);
  // The executor names sources the physician excluded when they were the only ones that could answer.
  const excludedStep = run.plan.find(step => step.status === "skipped" && /исключены в вашем профиле/u.test(step.detail ?? ""));

  // Name what did not answer: «часть источников» does not tell the physician what is missing from the answer.
  const silent = graph ? [...new Set(graph.sources.filter(source => source.invoked && (source.outcome === "failed" || source.outcome === "unavailable")).map(source => source.name))] : [];
  const structural = [...(graph?.gaps ?? []), ...run.plan.map(step => step.detail ?? "")].some(text => STRUCTURAL.test(text));
  const missing = silent.length ? `${structural ? "Сейчас не читается" : `Не ответил${silent.length > 1 ? "и" : ""}`}: ${silent.join(", ")}` : "Часть источников не ответила";
  if (found) {
    // Older runs were stored «partial» when the only silent source was one the physician excluded.
    const onlyExcluded = run.toolsUsed.length > 0 && run.toolsUsed.every(tool => (tool.status !== "failed" && tool.status !== "unavailable") || EXCLUDED_IN_PROFILE.test(tool.note ?? ""));
    return sourceFailed || (run.status === "partial" && !onlyExcluded)
      ? { kind: "partial", label: "Готово частично", note: `${missing} — показано то, что дали остальные источники.${structural ? " Страница источника изменилась — повтор не поможет, пока это не исправят." : " Можно повторить позже."}`, tone: "warning", retryable: !structural }
      : { kind: "found", label: "Готово", note: null, tone: "ok" };
  }
  if (excludedStep && !searched) return { kind: "not_run", label: "Проверка не выполнялась", note: `${excludedStep.detail}.`, tone: "warning" };
  if (nothingToSearch) return { kind: "not_run", label: "Проверка не выполнялась", note: options.monitoring ? "Не выбраны темы, по которым проверять. Выберите темы в настройках — проверка запустится." : "В запросе не распознаны заболевание, препарат или тема — искать было нечего.", tone: "warning" };
  if (sourceFailed && !searched) return { kind: "source_error", label: "Проверка не завершена", note: `${silent.length ? `${missing}. ` : ""}Источники не ответили — результат не установлен. Это не значит, что изменений или публикаций нет.`, tone: "danger", retryable: !structural };
  if (sourceFailed) return { kind: "source_error", label: "Результат не установлен", note: `${missing}, в остальных ничего не нашлось — вывод «ничего нет» сделать нельзя.`, tone: "warning", retryable: !structural };
  return options.monitoring
    ? { kind: "not_found", label: "Проверено: изменений не найдено", note: null, tone: "neutral" }
    : { kind: "not_found", label: "Проверено: ничего не найдено", note: null, tone: "neutral" };
}

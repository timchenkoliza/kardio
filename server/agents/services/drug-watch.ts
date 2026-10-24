import { assessDrugChange, drugAssessmentToAttributes } from "@/lib/agents/drug-change-assessment";
import { stableId, truncate } from "@/lib/agents/text";
import type { Evidence, WatchedDrug } from "@/lib/agents/types";
import type { DrugLabelResult } from "../adapters/openfda";
import type { DrugRecall, DrugRecallResult } from "../adapters/openfda-enforcement";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { DRUG_SNAPSHOT_RETRIEVED_AT } from "../snapshots/drug-changes";
import { drugChangesForDrugs } from "./drug-change";
import { evidenceFromQuote } from "./evidence";
import { factCheck } from "./fact-check";

/**
 * «Мои препараты» (A4): safety and regulatory changes for the drugs the
 * physician follows, in any specialty.
 *
 *   FDA recalls (openFDA enforcement, live)          → «США: отзыв серий»
 *   FDA label changes after the drug was followed      → «США: изменения инструкции»
 *   editorial regulatory snapshot (RU / FDA / EU)       → existing signals with the GRLS gate
 *   Росздравнадзор, ГРЛС                                → not connected: named in the plan, never implied
 *
 * An alert needs a regulator document and a date. A month without any
 * finding produces one explicit «изменений не найдено» summary that says what
 * was checked — and what could not be.
 */

export const WATCH_CONNECTORS = { recalls: "openfda-enforcement", labels: "openfda-labels", snapshot: "regulatory-news" } as const;
const WATCH_HORIZON_DAYS = 365;
const RU_SOURCES = "Росздравнадзор и ГРЛС не подключены — решения российского регулятора проверяйте на roszdravnadzor.gov.ru и grls.rosminzdrav.ru.";

function since(drug: WatchedDrug, ctx: AgentContext): Date {
  const horizon = ctx.now.getTime() - WATCH_HORIZON_DAYS * 86_400_000;
  const added = Date.parse(drug.addedAt);
  // Recalls are looked up for the last year at most; earlier records are history, not news.
  return new Date(Math.max(horizon, Number.isFinite(added) ? Math.min(added, ctx.now.getTime()) - 90 * 86_400_000 : horizon));
}

function classNumber(classification: string | null): string | null {
  const match = classification?.match(/Class\s+(I{1,3})/u);
  return match ? match[1] : null;
}

function recallDraft(ctx: AgentContext, drug: WatchedDrug, recall: DrugRecall, retrievedAt: string): ResultDraft {
  const assessment = assessDrugChange({ type: "WITHDRAWAL", region: "US", status: "effective", sourceKind: "primary", verificationTarget: "FDA Enforcement Report", practiceImpact: "Отзыв серий на рынке США. К препаратам в России относится, только если совпадают производитель и серия. " + RU_SOURCES });
  const evidence: Evidence = factCheck(evidenceFromQuote({
    connectorId: WATCH_CONNECTORS.recalls, sourceName: "FDA Enforcement Report (openFDA)", sourceUrl: recall.apiUrl, publisher: "U.S. Food and Drug Administration",
    retrievedAt, publishedAt: recall.reportDate, claim: recall.reasonForRecall, quote: recall.reasonForRecall, quoteLanguage: "en", quoteKind: "verbatim", level: "regulatory", secondary: false, verifyIn: null,
    dataOrigin: "runtime_api",
  }));
  const cls = classNumber(recall.classification);
  return {
    key: stableId("drug-watch-recall", drug.inn, recall.recallNumber),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "drug_change",
    category: "WITHDRAWAL",
    title: `США: отзыв серий — ${drug.ru}${cls ? ` (класс ${cls})` : ""}`,
    summary: `Отзыв ${recall.recallNumber}${recall.recallingFirm ? ` · ${recall.recallingFirm}` : ""}. Продукт: ${truncate(recall.productDescription, 160)}. Причина — в тексте FDA на английском.`,
    reasonShown: [`Мои препараты: ${drug.ru}`],
    observedAt: recall.reportDate,
    evidence: [evidence],
    source: { connectorId: WATCH_CONNECTORS.recalls, source: "FDA Enforcement Report (openFDA)", sourceUrl: recall.apiUrl, publisher: "U.S. Food and Drug Administration", retrievedAt, publishedAt: recall.reportDate, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    actions: [
      { kind: "open_source", label: "Запись FDA", href: recall.apiUrl, requiresConfirmation: false },
      { kind: "open_source", label: "Росздравнадзор", href: "https://roszdravnadzor.gov.ru/", requiresConfirmation: false },
      { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
    ],
    attributes: { inn: drug.inn, region: "США", recallNumber: recall.recallNumber, classification: recall.classification, recallStatus: recall.status, changeDate: recall.reportDate, watch: true, ...drugAssessmentToAttributes(assessment) },
    partner: null,
    rank: 0,
  };
}

function labelChangeDraft(ctx: AgentContext, drug: WatchedDrug, result: DrugLabelResult): ResultDraft | null {
  const label = result.label;
  const changes = label?.sections.find(section => section.id === "recent_major_changes");
  if (!label || !changes || !label.effectiveDate) return null;
  // Only a revision that took effect after the drug was followed is news; the label itself is reference.
  if (label.effectiveDate.slice(0, 10) < drug.addedAt.slice(0, 10)) return null;
  const assessment = assessDrugChange({ type: "LABEL_CHANGE", region: "US", status: "effective", sourceKind: "primary", verificationTarget: "DailyMed", practiceImpact: "Изменение инструкции в США. Российская инструкция меняется отдельно. " + RU_SOURCES });
  const evidence = factCheck(evidenceFromQuote({
    connectorId: WATCH_CONNECTORS.labels, sourceName: "Инструкция FDA (DailyMed)", sourceUrl: label.dailyMedUrl, publisher: "U.S. Food and Drug Administration",
    retrievedAt: result.retrievedAt, publishedAt: label.effectiveDate, claim: changes.text, quote: changes.text, quoteLanguage: "en", quoteKind: "verbatim", level: "regulatory", secondary: false, verifyIn: null, dataOrigin: "runtime_api",
  }));
  return {
    key: stableId("drug-watch-label", drug.inn, label.setId, label.effectiveDate),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "drug_change",
    category: "LABEL_CHANGE",
    title: `США: изменения инструкции FDA — ${drug.ru}`,
    summary: `Редакция от ${label.effectiveDate}. Раздел «Недавние изменения инструкции» — на английском, по ссылке на DailyMed.`,
    reasonShown: [`Мои препараты: ${drug.ru}`],
    observedAt: label.effectiveDate,
    evidence: [evidence],
    source: { connectorId: WATCH_CONNECTORS.labels, source: "Инструкция FDA (DailyMed)", sourceUrl: label.dailyMedUrl, publisher: "U.S. Food and Drug Administration", retrievedAt: result.retrievedAt, publishedAt: label.effectiveDate, version: label.version, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    actions: [
      { kind: "open_source", label: "Инструкция на DailyMed", href: label.dailyMedUrl, requiresConfirmation: false },
      { kind: "open_source", label: "Проверить в ГРЛС", href: "https://grls.rosminzdrav.ru/", requiresConfirmation: false },
      { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
    ],
    attributes: { inn: drug.inn, region: "США", changeDate: label.effectiveDate, watch: true, ...drugAssessmentToAttributes(assessment) },
    partner: null,
    rank: 0,
  };
}

/** Month key (YYYY-MM, UTC) of the «no changes» summary: one per month. */
export function quietMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function quietDraft(ctx: AgentContext, drugs: readonly WatchedDrug[], checked: { recalls: number; labels: number }): ResultDraft {
  const month = quietMonth(ctx.now);
  const names = drugs.map(drug => drug.ru).join(", ");
  const sources = [checked.recalls ? `отзывы FDA (онлайн, ${checked.recalls} из ${drugs.length})` : null, checked.labels ? `инструкции FDA (онлайн, ${checked.labels} из ${drugs.length})` : null, `снимок регуляторных сообщений от ${DRUG_SNAPSHOT_RETRIEVED_AT.slice(0, 10)}`].filter(Boolean).join("; ");
  const evidence: Evidence = {
    id: stableId("ev", "drug-watch-quiet", month, names),
    claim: `Проверены: ${sources}`,
    sourceId: WATCH_CONNECTORS.recalls,
    sourceUrl: null,
    sourceType: "unknown",
    publicationDate: null,
    retrievedAt: ctx.nowIso,
    evidenceLevel: "unknown",
    confidence: 0,
    verificationStatus: "UNKNOWN",
    verificationNote: "Отсутствие изменений — результат проверки перечисленных источников, а не подтверждение регулятора. " + RU_SOURCES,
    supportText: null,
    provenance: { connectorId: WATCH_CONNECTORS.recalls, source: "Проверка «Мои препараты»", sourceUrl: null, publisher: null, retrievedAt: ctx.nowIso, publishedAt: null, version: null, ownership: "GENERATED", dataOrigin: "runtime_api" },
  };
  return {
    key: stableId("drug-watch-quiet", month),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "drug_change",
    category: "NO_CHANGES",
    title: `Мои препараты: изменений не найдено`,
    summary: `${names}. Проверены ${sources}. ${RU_SOURCES}`,
    reasonShown: [`Ежемесячная сводка за ${month}`],
    observedAt: null,
    evidence: [evidence],
    source: evidence.provenance,
    actions: [
      { kind: "open_source", label: "Росздравнадзор", href: "https://roszdravnadzor.gov.ru/", requiresConfirmation: false },
      { kind: "open_source", label: "ГРЛС", href: "https://grls.rosminzdrav.ru/", requiresConfirmation: false },
    ],
    attributes: { watch: true, month, drugs: drugs.length },
    partner: null,
    rank: 99,
  };
}

export interface WatchCheck {
  drafts: ResultDraft[];
  /** Per source: how many drugs were actually checked (an unavailable source is not «no changes»). */
  checked: { recalls: number; labels: number };
  failed: { recalls: string[]; labels: string[] };
}

/** Runs the watchlist checks with bounded concurrency; lookups are cached per process for 6 h. */
export async function checkWatchlist(ctx: AgentContext, deps: { recalls: (inn: string, since: Date) => Promise<DrugRecallResult> }): Promise<WatchCheck> {
  const drugs = ctx.profile.watchlist;
  const drafts: ResultDraft[] = [];
  const checked = { recalls: 0, labels: 0 };
  const failed = { recalls: [] as string[], labels: [] as string[] };
  if (!drugs.length) return { drafts, checked, failed };
  const queue = [...drugs];
  const worker = async () => {
    for (let drug = queue.shift(); drug; drug = queue.shift()) {
      const [recalls, label] = await Promise.all([deps.recalls(drug.inn, since(drug, ctx)), ctx.drugLabel(drug.inn)]);
      if (recalls.status === "ok") { checked.recalls += 1; for (const recall of recalls.recalls) drafts.push(recallDraft(ctx, drug, recall, recalls.retrievedAt)); }
      else failed.recalls.push(drug.ru);
      if (label.status === "ok" || label.status === "not_found") { checked.labels += 1; const change = labelChangeDraft(ctx, drug, label); if (change) drafts.push(change); }
      else failed.labels.push(drug.ru);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, drugs.length) }, worker));
  drafts.push(...drugChangesForDrugs(ctx, drugs.map(drug => drug.ru)).map(draft => ({ ...draft, reasonShown: [`Мои препараты: ${String(draft.attributes.inn ?? "")}`], attributes: { ...draft.attributes, watch: true } })));
  // «No changes» only when every source answered for every drug: an outage is never reported as quiet.
  const complete = !failed.recalls.length && !failed.labels.length;
  if (!drafts.length && complete) drafts.push(quietDraft(ctx, drugs, checked));
  return { drafts, checked, failed };
}

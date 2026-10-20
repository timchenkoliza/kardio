import { stableId } from "@/lib/agents/text";
import type { Evidence } from "@/lib/agents/types";
import {
  diffGuidelineDocuments,
  guidelineBasisLabel,
  guidelineChangeStats,
  guidelineChangesToAttributes,
  meaningfulGuidelineChanges,
  type GuidelineComparisonBasis,
  type GuidelineRecommendationChange,
  type GuidelineRecommendationVersion,
  type GuidelineVersionDocument,
} from "@/lib/agents/guideline-version-diff";
import { topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { GUIDELINE_SNAPSHOT_RETRIEVED_AT, GUIDELINE_UPDATES, type GuidelineAssertion, type GuidelineUpdateRecord } from "../snapshots/guideline-updates";
import { catalogProvenance, evidenceFromCatalog, evidenceFromQuote, unavailableEvidence } from "./evidence";
import { factCheck } from "./fact-check";
import { contentMatchesTopics, evidenceEligibleCatalog, sourcePreferenceMatches } from "./search";

/**
 * Guidelines v2.
 *
 * Comparison honesty is explicit:
 * - available_text_pair: both old and new recommendation extracts are present;
 * - curated_delta: a real public source states what changed, but both full texts are not in the product;
 * - current_text_only: only current recommendation text is available;
 * - metadata_only: only version/status/ICD metadata can be compared.
 */

export interface MetadataDelta {
  field: "year" | "status" | "icd_added" | "icd_removed";
  label: string;
}

function icdCodes(content: ContentObject): string[] {
  return content.tags.filter(tag => /^[A-ZА-Я]\d{2}(?:\.\d)?$/u.test(tag.trim())).map(tag => tag.trim());
}

/** Deterministic metadata comparison retained for records without paired text. */
export function guidelineDiff(previous: ContentObject, next: ContentObject): MetadataDelta[] {
  const deltas: MetadataDelta[] = [];
  if (previous.publicationYear !== next.publicationYear) deltas.push({ field: "year", label: `Версия ${next.publicationYear ?? "без года"} заменяет версию ${previous.publicationYear ?? "без года"}` });
  if (previous.currentness !== next.currentness) deltas.push({ field: "status", label: `Статус: ${next.currentness === "current" ? "актуальная версия по данным источника" : next.currentness}; предыдущая — ${previous.currentness === "superseded" ? "заменена" : previous.currentness}` });
  const before = new Set(icdCodes(previous));
  const after = new Set(icdCodes(next));
  const added = [...after].filter(code => !before.has(code));
  const removed = [...before].filter(code => !after.has(code));
  if (added.length) deltas.push({ field: "icd_added", label: `В новой версии указаны коды МКБ-10: ${added.join(", ")}` });
  if (removed.length) deltas.push({ field: "icd_removed", label: `Коды МКБ-10 только в прежней версии: ${removed.join(", ")}` });
  return deltas;
}

function recommendationClass(text: string): string | null {
  return text.match(/(?:класс|class)\s+(I{1,3}[ab]?|IV)\b/iu)?.[1]?.toUpperCase() ?? null;
}

function evidenceLevel(text: string): string | null {
  return text.match(/(?:уровень(?:\s+доказательности)?|level)\s+([ABC])\b/iu)?.[1]?.toUpperCase() ?? null;
}

function cardIdentity(card: ContentObject, index: number): string {
  const topicKey = [...card.topics].sort().join("+") || "general";
  const typeKey = card.type.toLocaleLowerCase("ru-RU").replace(/\s+/gu, "-");
  return `${typeKey}:${topicKey}:${index}`;
}

function recommendationCards(content: readonly ContentObject[], guideline: ContentObject): ContentObject[] {
  if (!guideline.publicationYear) return [];
  return content
    .filter(item => item.kind === "clinical" && item.specialty === guideline.specialty && item.publicationYear === guideline.publicationYear)
    .filter(item => item.topics.some(topic => guideline.topics.includes(topic)))
    .sort((a, b) => a.type.localeCompare(b.type, "ru") || a.title.localeCompare(b.title, "ru"));
}

function documentFromCards(guideline: ContentObject, cards: readonly ContentObject[]): GuidelineVersionDocument {
  const perIdentity = new Map<string, number>();
  const recommendations: GuidelineRecommendationVersion[] = cards.map(card => {
    const root = `${card.type.toLocaleLowerCase("ru-RU")}:${[...card.topics].sort().join("+") || "general"}`;
    const index = perIdentity.get(root) ?? 0;
    perIdentity.set(root, index + 1);
    const text = card.summary.trim();
    return {
      id: cardIdentity(card, index),
      text,
      recommendationClass: recommendationClass(text),
      evidenceLevel: evidenceLevel(text),
      patientScope: null,
      practiceImpact: null,
      sourceUrl: card.canonicalUrl ?? card.source.url,
    };
  });
  return {
    id: guideline.id,
    title: guideline.title,
    version: guideline.version ?? (guideline.publicationYear ? String(guideline.publicationYear) : null),
    publishedAt: guideline.publicationDate ?? (guideline.publicationYear ? String(guideline.publicationYear) : null),
    sourceUrl: guideline.canonicalUrl ?? guideline.source.url,
    recommendations,
  };
}

function societyMatchesPreferences(record: GuidelineUpdateRecord, trusted: readonly string[], excluded: readonly string[]): { allowed: boolean; trusted: boolean } {
  const isEsc = record.society.startsWith("ESC");
  if (isEsc && excluded.includes("esc")) return { allowed: false, trusted: false };
  return { allowed: true, trusted: isEsc ? trusted.includes("esc") : trusted.includes("aha") };
}

interface CuratedImpact {
  patientScope?: string;
  practiceImpact?: string;
  recommendationClassAfter?: string;
}

/** Only details stated by the quoted source are encoded here. */
const CURATED_IMPACT: Record<string, CuratedImpact> = {
  "esc-hf-2026:0": {
    patientScope: "Пациенты с сердечной недостаточностью",
    practiceImpact: "Использовать две категории по ФВ ЛЖ: HFrEF <50% и HFpEF ≥50% при наличии диастолической дисфункции.",
  },
  "esc-hf-2026:1": {
    patientScope: "Госпитализированные пациенты с декомпенсированной сердечной недостаточностью",
    practiceImpact: "После стабилизации рассматривать начало иНГЛТ-2 в стационаре; раннюю диуретическую терапию титровать с учётом натрия мочи.",
  },
  "esc-hf-2026:3": {
    patientScope: "Симптомная СН, ФВ ЛЖ ≥45%, ИМТ ≥30, независимо от наличия диабета",
    practiceImpact: "Рассмотреть семаглутид или тирзепатид.",
    recommendationClassAfter: "IIa",
  },
  "esc-hf-2026:4": {
    patientScope: "Пациенты с артериальной гипертензией или стадией B сердечной недостаточности",
    practiceImpact: "Ориентироваться на целевое САД <130 мм рт. ст., если это соответствует клиническому контексту рекомендации.",
  },
  "esc-cvd-ckd-2026:0": {
    patientScope: "Пациенты с сочетанием сердечно-сосудистых заболеваний и ХБП",
    practiceImpact: "Использовать STAMP как рамку для скрининга, триажа риска ХБП, адаптации ведения ССЗ и планирования помощи.",
  },
  "esc-cvd-ckd-2026:1": {
    patientScope: "Пациенты с ОКС, СН, аритмиями, инсультом, ЗПА или риском внезапной сердечной смерти",
    practiceImpact: "Активно выявлять хроническую болезнь почек в перечисленных сердечно-сосудистых сценариях.",
  },
};

function curatedChange(record: GuidelineUpdateRecord, assertion: GuidelineAssertion, index: number): GuidelineRecommendationChange {
  const impact = CURATED_IMPACT[`${record.id}:${index}`] ?? {};
  return {
    id: `${record.id}:${index}`,
    changeKind: record.kind === "first_guideline" ? "NEW" : "CHANGED",
    basis: "curated_delta",
    previousText: null,
    currentText: assertion.claim,
    recommendationClassBefore: null,
    recommendationClassAfter: impact.recommendationClassAfter ?? recommendationClass(`${assertion.claim} ${assertion.quote}`),
    evidenceLevelBefore: null,
    evidenceLevelAfter: evidenceLevel(`${assertion.claim} ${assertion.quote}`),
    patientScope: impact.patientScope ?? null,
    practiceImpact: impact.practiceImpact ?? null,
    supportText: assertion.quote,
    sourceUrl: record.summarySource.url,
  };
}

function compactDelta(changes: readonly GuidelineRecommendationChange[], basis: GuidelineComparisonBasis, metadata: readonly string[] = []): string {
  const meaningful = meaningfulGuidelineChanges(changes);
  const stats = guidelineChangeStats(changes);
  const parts = [
    meaningful.length ? `${meaningful.length} содержательных изменений` : null,
    stats.NEW ? `новых: ${stats.NEW}` : null,
    stats.CHANGED ? `изменено: ${stats.CHANGED}` : null,
    stats.REMOVED ? `удалено: ${stats.REMOVED}` : null,
    stats.actionable ? `с практическим действием: ${stats.actionable}` : null,
    meaningful.find(change => change.recommendationClassAfter)?.recommendationClassAfter ? `класс: ${meaningful.find(change => change.recommendationClassAfter)?.recommendationClassAfter}` : null,
    stats.UNCHANGED ? `без изменений: ${stats.UNCHANGED}` : null,
    !meaningful.length && metadata.length ? metadata[0] : null,
    guidelineBasisLabel(basis),
  ].filter(Boolean);
  return parts.join(" · ");
}

function changeSummary(changes: readonly GuidelineRecommendationChange[], fallback: string): string {
  const meaningful = meaningfulGuidelineChanges(changes);
  const actionable = meaningful.filter(change => change.practiceImpact);
  if (actionable.length) return actionable.slice(0, 2).map(change => change.practiceImpact).join(" ");
  if (meaningful.length) return meaningful.slice(0, 2).map(change => change.currentText ?? (change.previousText ? `Удалено: ${change.previousText}` : "")).filter(Boolean).join(" ");
  return fallback;
}

export function catalogGuidelineChanges(ctx: AgentContext): ResultDraft[] {
  const { specialty } = ctx;
  const topics = ctx.preference.topics;
  const content = evidenceEligibleCatalog(ctx.catalog.content);
  const byId = new Map(content.map(item => [item.id, item]));
  const drafts: ResultDraft[] = [];
  if (sourcePreferenceMatches("src-rko-guidelines", ctx.preference.excludedSources)) return drafts;

  const guidelines = content.filter(item => item.kind === "guideline" && item.specialty === specialty);
  for (const next of guidelines) {
    const matched = topics.length ? contentMatchesTopics(next, specialty, topics) : [];
    if (topics.length && !matched.length) continue;

    if (next.supersedesId) {
      const previous = byId.get(next.supersedesId);
      if (!previous) continue;
      const metadata = guidelineDiff(previous, next);
      const previousCards = recommendationCards(content, previous);
      const nextCards = recommendationCards(content, next);
      const basis: GuidelineComparisonBasis = previousCards.length && nextCards.length ? "available_text_pair" : nextCards.length ? "current_text_only" : "metadata_only";
      const changes = basis === "available_text_pair"
        ? diffGuidelineDocuments(documentFromCards(previous, previousCards), documentFromCards(next, nextCards), basis)
        : basis === "current_text_only"
          ? nextCards.map((card, index) => ({
              id: cardIdentity(card, index),
              changeKind: "NEW" as const,
              basis,
              previousText: null,
              currentText: card.summary,
              recommendationClassBefore: null,
              recommendationClassAfter: recommendationClass(card.summary),
              evidenceLevelBefore: null,
              evidenceLevelAfter: evidenceLevel(card.summary),
              patientScope: null,
              practiceImpact: null,
              supportText: card.summary,
              sourceUrl: card.canonicalUrl ?? card.source.url,
            }))
          : [];

      const chainEvidence = evidenceFromCatalog(next, `${next.source.name}: «${next.title}», версия ${next.publicationYear}, заменяет версию ${previous.publicationYear}`);
      chainEvidence.supportText = `${chainEvidence.supportText}. ${next.source.name}. Заменяет версию: «${previous.title}», ${previous.publicationYear ?? "год не указан"}`;
      const evidence: Evidence[] = [
        factCheck(chainEvidence, { currentness: next.currentness, editorialStatus: next.editorialStatus }),
        ...nextCards.map(card => factCheck(evidenceFromCatalog(card), { currentness: card.currentness, editorialStatus: card.editorialStatus })),
        ...previousCards.map(card => factCheck(evidenceFromCatalog(card), { currentness: card.currentness, editorialStatus: card.editorialStatus })),
      ];
      if (basis !== "available_text_pair") evidence.push(unavailableEvidence("Построчное сравнение рекомендаций двух версий", "catalog", basis === "current_text_only" ? "В каталоге есть содержательные карточки только новой версии" : "Тексты рекомендаций двух версий в каталоге не представлены", ctx.nowIso));

      const attrs = guidelineChangesToAttributes({
        basis,
        previousVersion: previous.version ?? (previous.publicationYear ? String(previous.publicationYear) : null),
        newVersion: next.version ?? (next.publicationYear ? String(next.publicationYear) : null),
        changes,
        metadataDeltas: metadata.map(delta => delta.label),
      });
      drafts.push({
        key: stableId("guideline", "catalog-chain", previous.id, next.id),
        agentId: ctx.agentId,
        specialty,
        kind: "guideline_change",
        category: "new_version",
        title: `${next.title}: версия ${next.publicationYear} вместо ${previous.publicationYear}`,
        summary: changeSummary(changes, metadata.map(delta => delta.label).join(". ")),
        reasonShown: [matched.length ? `Тема: ${topicLabels(specialty, matched).join(", ")}` : "Все темы специальности", `Источник: рекомендации РКО`, guidelineBasisLabel(basis)],
        observedAt: next.publicationYear ? `${next.publicationYear}-01-01` : null,
        evidence,
        source: catalogProvenance(next),
        actions: [
          { kind: "open_internal", label: "Новая версия", href: `/${specialty}/content/${encodeURIComponent(next.id)}`, requiresConfirmation: false },
          { kind: "open_internal", label: "Прежняя версия", href: `/${specialty}/content/${encodeURIComponent(previous.id)}`, requiresConfirmation: false },
          { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
        ],
        attributes: {
          society: "РКО",
          previousVersion: String(previous.publicationYear ?? ""),
          newVersion: String(next.publicationYear ?? ""),
          deltas: compactDelta(changes, basis, metadata.map(delta => delta.label)),
          textCompared: basis === "available_text_pair",
          ...attrs,
        },
        partner: null,
        rank: 0,
      });
      continue;
    }

    if (next.currentness === "review" && !next.supersededById && matched.length) {
      const attrs = guidelineChangesToAttributes({ basis: "metadata_only", previousVersion: null, newVersion: next.version ?? (next.publicationYear ? String(next.publicationYear) : null), changes: [] });
      drafts.push({
        key: stableId("guideline", "needs-check", next.id),
        agentId: ctx.agentId,
        specialty,
        kind: "guideline_change",
        category: "needs_check",
        title: `${next.title}${next.publicationYear ? ` (${next.publicationYear})` : ""}: проверьте актуальность`,
        summary: "Новая версия в каталоге не найдена, но и актуальность этой версии источник не подтверждает. Сверьте с рубрикатором Минздрава перед использованием.",
        reasonShown: [`Тема: ${topicLabels(specialty, matched).join(", ")}`, "Статус версии требует проверки", guidelineBasisLabel("metadata_only")],
        observedAt: null,
        evidence: [factCheck(evidenceFromCatalog(next, `«${next.title}»${next.publicationYear ? `, ${next.publicationYear}` : ""} — версия в каталоге РКО`), { currentness: next.currentness, editorialStatus: next.editorialStatus })],
        source: catalogProvenance(next),
        actions: [
          { kind: "open_internal", label: "Открыть", href: `/${specialty}/content/${encodeURIComponent(next.id)}`, requiresConfirmation: false },
          { kind: "open_source", label: "Рубрикатор КР", href: "https://cr.minzdrav.gov.ru/", requiresConfirmation: false },
        ],
        attributes: { society: "РКО", deltas: guidelineBasisLabel("metadata_only"), textCompared: false, ...attrs },
        partner: null,
        rank: 0,
      });
    }
  }
  return drafts;
}

export function societyGuidelineChanges(ctx: AgentContext, specialty: SpecialtyId = ctx.specialty): ResultDraft[] {
  if (specialty !== "cardiology") return [];
  const topics = ctx.preference.topics;
  const horizonStart = ctx.now.getTime() - ctx.preference.horizonDays * 86_400_000;
  const drafts: ResultDraft[] = [];
  for (const record of GUIDELINE_UPDATES) {
    const preference = societyMatchesPreferences(record, ctx.preference.trustedSources, ctx.preference.excludedSources);
    if (!preference.allowed) continue;
    const matched = topics.length ? record.topics.filter(topic => topics.includes(topic)) : [];
    if (topics.length && !matched.length) continue;
    const dateForWindow = record.publishedAt ?? record.summarySource.publishedAt;
    if (dateForWindow && new Date(`${dateForWindow}T00:00:00Z`).getTime() < horizonStart) continue;

    const changes = record.assertions.map((assertion, index) => curatedChange(record, assertion, index));
    const evidence = record.assertions.map(assertion => factCheck(evidenceFromQuote({
      connectorId: "esc-guidelines",
      sourceName: record.summarySource.name,
      sourceUrl: record.summarySource.url,
      publisher: record.society,
      retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT,
      publishedAt: record.summarySource.publishedAt,
      version: record.title,
      claim: assertion.claim,
      quote: assertion.quote,
      quoteLanguage: assertion.quoteLanguage,
      quoteKind: "page_extract",
      level: "guideline",
      secondary: record.summarySource.url !== record.primaryUrl,
      verifyIn: record.doi ? `European Heart Journal, doi:${record.doi}` : null,
    }), { dateUncertain: !record.publishedAt }));

    const kindLabel = record.kind === "first_guideline" ? "первые рекомендации по теме" : record.kind === "consensus_document" ? "согласительный документ" : `новая версия вместо: ${record.previousVersion}`;
    const attrs = guidelineChangesToAttributes({ basis: "curated_delta", previousVersion: record.previousVersion, newVersion: record.title, changes });
    drafts.push({
      key: stableId("guideline", "society", record.id),
      agentId: ctx.agentId,
      specialty,
      kind: "guideline_change",
      category: record.kind,
      title: record.titleRu,
      summary: changeSummary(changes, `${record.title} — ${kindLabel}.`),
      reasonShown: [matched.length ? `Тема: ${topicLabels(specialty, matched).join(", ")}` : "Все темы специальности", preference.trusted ? `${record.society} в доверенных источниках` : record.society, guidelineBasisLabel("curated_delta")],
      observedAt: record.publishedAt ?? record.summarySource.publishedAt,
      evidence,
      source: {
        connectorId: "esc-guidelines",
        source: record.society,
        sourceUrl: record.primaryUrl,
        publisher: record.society,
        retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT,
        publishedAt: record.publishedAt,
        version: record.title,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "curated_snapshot",
      },
      actions: [
        { kind: "open_source", label: "Первоисточник", href: record.primaryUrl, requiresConfirmation: false },
        { kind: "open_source", label: `Обзор · ${record.summarySource.name}`, href: record.summarySource.url, requiresConfirmation: false },
        { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
      ],
      attributes: {
        society: record.society,
        previousVersion: record.previousVersion,
        publishedNote: record.publishedNote,
        doi: record.doi,
        deltas: compactDelta(changes, "curated_delta"),
        textCompared: false,
        ...attrs,
      },
      partner: null,
      rank: 0,
    });
  }
  return drafts;
}

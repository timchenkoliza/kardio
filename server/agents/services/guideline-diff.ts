import { stableId } from "@/lib/agents/text";
import type { Evidence } from "@/lib/agents/types";
import { topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { GUIDELINE_SNAPSHOT_RETRIEVED_AT, GUIDELINE_UPDATES, type GuidelineUpdateRecord } from "../snapshots/guideline-updates";
import { catalogProvenance, evidenceFromCatalog, evidenceFromQuote, unavailableEvidence } from "./evidence";
import { factCheck } from "./fact-check";
import { contentMatchesTopics, evidenceEligibleCatalog, sourcePreferenceMatches } from "./search";

/**
 * GuidelineDiffService. Compares what is actually available:
 *  - catalog version chains (metadata + ICD coverage + structural cards);
 *  - curated society publications with quoted deltas.
 * When document text is not available it says so instead of inventing deltas.
 */

export interface MetadataDelta {
  field: "year" | "status" | "icd_added" | "icd_removed";
  label: string;
}

function icdCodes(content: ContentObject): string[] {
  return content.tags.filter(tag => /^[A-ZА-Я]\d{2}(?:\.\d)?$/u.test(tag.trim())).map(tag => tag.trim());
}

/** guidelineDiff(): deterministic comparison of two catalog versions. */
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

function societyMatchesPreferences(record: GuidelineUpdateRecord, trusted: readonly string[], excluded: readonly string[]): { allowed: boolean; trusted: boolean } {
  const isEsc = record.society.startsWith("ESC");
  if (isEsc && excluded.includes("esc")) return { allowed: false, trusted: false };
  return { allowed: true, trusted: isEsc ? trusted.includes("esc") : trusted.includes("aha") };
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
      const deltas = guidelineDiff(previous, next);
      const cards = content.filter(item => item.kind === "clinical" && item.topics.some(topic => next.topics.includes(topic)) && item.publicationYear === next.publicationYear);
      const chainEvidence = evidenceFromCatalog(next, `${next.source.name}: «${next.title}», версия ${next.publicationYear}, заменяет версию ${previous.publicationYear}`);
      chainEvidence.supportText = `${chainEvidence.supportText}. ${next.source.name}. Заменяет версию: «${previous.title}», ${previous.publicationYear ?? "год не указан"}`;
      const evidence: Evidence[] = [
        factCheck(chainEvidence, { currentness: next.currentness, editorialStatus: next.editorialStatus }),
        ...cards.map(card => factCheck(evidenceFromCatalog(card), { currentness: card.currentness, editorialStatus: card.editorialStatus })),
      ];
      if (!cards.length) evidence.push(unavailableEvidence("Содержательные отличия между версиями", "catalog", "Полные тексты версий в каталоге не загружены — сравнены только метаданные", ctx.nowIso));
      drafts.push({
        key: stableId("guideline", "catalog-chain", previous.id, next.id),
        agentId: ctx.agentId,
        specialty,
        kind: "guideline_change",
        category: "new_version",
        title: `${next.title}: версия ${next.publicationYear} вместо ${previous.publicationYear}`,
        summary: cards.length ? cards.map(card => card.summary).join(" ") : deltas.map(delta => delta.label).join(". "),
        reasonShown: [matched.length ? `Тема: ${topicLabels(specialty, matched).join(", ")}` : "Все темы специальности", "Источник: рекомендации РКО"],
        observedAt: next.publicationYear ? `${next.publicationYear}-01-01` : null,
        evidence,
        source: catalogProvenance(next),
        actions: [
          { kind: "open_internal", label: "Новая версия", href: `/${specialty}/content/${encodeURIComponent(next.id)}`, requiresConfirmation: false },
          { kind: "open_internal", label: "Прежняя версия", href: `/${specialty}/content/${encodeURIComponent(previous.id)}`, requiresConfirmation: false },
          { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
        ],
        attributes: { society: "РКО", previousVersion: String(previous.publicationYear ?? ""), newVersion: String(next.publicationYear ?? ""), deltas: deltas.map(delta => delta.label).join(" · "), textCompared: cards.length > 0 },
        partner: null,
        rank: 0,
      });
      continue;
    }

    if (next.currentness === "review" && !next.supersededById && matched.length) {
      drafts.push({
        key: stableId("guideline", "needs-check", next.id),
        agentId: ctx.agentId,
        specialty,
        kind: "guideline_change",
        category: "needs_check",
        title: `${next.title}${next.publicationYear ? ` (${next.publicationYear})` : ""}: проверьте актуальность`,
        summary: "Новая версия в каталоге не найдена, но и актуальность этой версии источник не подтверждает. Сверьте с рубрикатором Минздрава перед использованием.",
        reasonShown: [`Тема: ${topicLabels(specialty, matched).join(", ")}`, "Статус версии требует проверки"],
        observedAt: null,
        evidence: [factCheck(evidenceFromCatalog(next, `«${next.title}»${next.publicationYear ? `, ${next.publicationYear}` : ""} — версия в каталоге РКО`), { currentness: next.currentness, editorialStatus: next.editorialStatus })],
        source: catalogProvenance(next),
        actions: [
          { kind: "open_internal", label: "Открыть", href: `/${specialty}/content/${encodeURIComponent(next.id)}`, requiresConfirmation: false },
          { kind: "open_source", label: "Рубрикатор КР", href: "https://cr.minzdrav.gov.ru/", requiresConfirmation: true },
        ],
        attributes: { society: "РКО", textCompared: false },
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
    drafts.push({
      key: stableId("guideline", "society", record.id),
      agentId: ctx.agentId,
      specialty,
      kind: "guideline_change",
      category: record.kind,
      title: record.titleRu,
      summary: `${record.title} — ${kindLabel}. Ключевые изменения: ${record.assertions.length}.`,
      reasonShown: [matched.length ? `Тема: ${topicLabels(specialty, matched).join(", ")}` : "Все темы специальности", preference.trusted ? `${record.society} в доверенных источниках` : record.society],
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
        { kind: "open_source", label: "Первоисточник", href: record.primaryUrl, requiresConfirmation: true },
        { kind: "open_source", label: `Обзор · ${record.summarySource.name}`, href: record.summarySource.url, requiresConfirmation: true },
        { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
      ],
      attributes: { society: record.society, previousVersion: record.previousVersion, publishedNote: record.publishedNote, doi: record.doi, textCompared: false },
      partner: null,
      rank: 0,
    });
  }
  return drafts;
}

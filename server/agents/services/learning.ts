import { stableId } from "@/lib/agents/text";
import type { Evidence, LearningGoal } from "@/lib/agents/types";
import { topicById, topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject } from "@/lib/domain/types";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { GUIDELINE_SNAPSHOT_RETRIEVED_AT, GUIDELINE_UPDATES } from "../snapshots/guideline-updates";
import { catalogProvenance, evidenceFromCatalog, evidenceFromQuote } from "./evidence";
import { eventDateLabel, eventDrafts, searchEvents } from "./event";
import { factCheck } from "./fact-check";
import { contentMatchesTopics, evidenceEligibleCatalog } from "./search";

/**
 * LearningService: generateLearningPlan() builds an ordered route from real
 * catalog objects (current guidelines, developer lectures, structured cards),
 * society updates and accredited events. Outdated lectures are flagged.
 */

type ModuleStep = "guideline" | "update" | "lecture" | "self_check" | "event";

const STEP_ORDER: Record<ModuleStep, number> = { guideline: 1, update: 2, lecture: 3, self_check: 4, event: 5 };

function currentGuideline(content: readonly ContentObject[], topicTopics: readonly string[]): ContentObject | null {
  const candidates = content.filter(item => item.kind === "guideline" && item.topics.some(topic => topicTopics.includes(topic)));
  return candidates.find(item => item.currentness === "current") ?? candidates.find(item => item.currentness === "review") ?? null;
}

function bestLecture(content: readonly ContentObject[], topicTopics: readonly string[], guidelineYear: number | null): { lecture: ContentObject | null; outdated: boolean } {
  const lectures = content.filter(item => item.kind === "video" && item.topics.some(topic => topicTopics.includes(topic)));
  const undated = lectures.find(item => !item.publicationYear);
  const matchingYear = guidelineYear ? lectures.find(item => item.publicationYear === guidelineYear) : null;
  const lecture = matchingYear ?? undated ?? lectures[0] ?? null;
  const outdated = Boolean(lecture?.publicationYear && guidelineYear && lecture.publicationYear < guidelineYear);
  return { lecture, outdated };
}

export function generateLearningPlan(ctx: AgentContext): ResultDraft[] {
  if (ctx.specialty !== "cardiology") return [];
  const goals: LearningGoal[] = ctx.preference.goals.length ? ctx.preference.goals : ["guideline_refresh"];
  const topics = ctx.preference.topics.slice(0, 4);
  const content = evidenceEligibleCatalog(ctx.catalog.content);
  const drafts: ResultDraft[] = [];

  const push = (topicId: string, step: ModuleStep, draft: Omit<ResultDraft, "key" | "agentId" | "specialty" | "kind" | "partner" | "rank"> & { moduleKey: string }) => {
    const key = stableId("learning", topicId, step, draft.moduleKey);
    drafts.push({
      key,
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "learning_module",
      partner: null,
      rank: topics.indexOf(topicId) * 10 + STEP_ORDER[step],
      ...draft,
      attributes: { ...draft.attributes, step, topic: topicId, done: ctx.profile.learningProgress[`${ctx.agentId}:${key}`] === "done" },
    });
  };

  for (const topicId of topics) {
    const topic = topicById(ctx.specialty, topicId);
    if (!topic) continue;
    const label = topicLabels(ctx.specialty, [topicId])[0];
    const guideline = currentGuideline(content, topic.catalogTopics);

    if (guideline && (goals.includes("guideline_refresh") || goals.includes("exam_prep") || goals.includes("new_topic"))) {
      push(topicId, "guideline", {
        moduleKey: guideline.id,
        category: "guideline",
        title: `${label}: клинические рекомендации${guideline.publicationYear ? ` ${guideline.publicationYear}` : ""}`,
        summary: guideline.currentness === "current" ? `${guideline.source.name}: актуальная версия по данным источника — начните с неё.` : `${guideline.source.name}: актуальность версии требует проверки — сверьте с рубрикатором Минздрава.`,
        reasonShown: [`Цель: ${goals.includes("exam_prep") ? "подготовка к аккредитации" : "освежить рекомендации"}`, `Тема: ${label}`],
        observedAt: null,
        evidence: [factCheck(evidenceFromCatalog(guideline), { currentness: guideline.currentness, editorialStatus: guideline.editorialStatus })],
        source: catalogProvenance(guideline),
        actions: [{ kind: "open_internal", label: "Открыть", href: `/${ctx.specialty}/content/${encodeURIComponent(guideline.id)}`, requiresConfirmation: false }],
        attributes: {},
      });
    }

    const update = GUIDELINE_UPDATES.find(record => record.topics.includes(topicId) && record.kind !== "consensus_document");
    if (update && (goals.includes("guideline_refresh") || goals.includes("new_topic"))) {
      const evidence: Evidence[] = update.assertions.slice(0, 2).map(assertion => factCheck(evidenceFromQuote({ connectorId: "esc-guidelines", sourceName: update.summarySource.name, sourceUrl: update.summarySource.url, publisher: update.society, retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT, publishedAt: update.summarySource.publishedAt, claim: assertion.claim, quote: assertion.quote, quoteLanguage: assertion.quoteLanguage, quoteKind: "page_extract", level: "guideline", secondary: true, verifyIn: update.doi ? `doi:${update.doi}` : null })));
      push(topicId, "update", {
        moduleKey: update.id,
        category: "update",
        title: `${label}: что нового в ${update.titleRu}`,
        summary: `${update.assertions.length} ключевых изменений с цитатами из источника.`,
        reasonShown: ["Свежие международные рекомендации по вашей теме"],
        observedAt: update.publishedAt,
        evidence,
        source: { connectorId: "esc-guidelines", source: update.society, sourceUrl: update.primaryUrl, publisher: update.society, retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT, publishedAt: update.publishedAt, version: update.title, ownership: "PUBLIC_SOURCE", dataOrigin: "curated_snapshot" },
        actions: [{ kind: "open_source", label: "Первоисточник", href: update.primaryUrl, requiresConfirmation: false }],
        attributes: {},
      });
    }

    const { lecture, outdated } = bestLecture(content, topic.catalogTopics, guideline?.publicationYear ?? null);
    if (lecture) {
      push(topicId, "lecture", {
        moduleKey: lecture.id,
        category: "lecture",
        title: `${label}: видеолекция разработчиков рекомендаций`,
        summary: outdated ? `Лекция к версии ${lecture.publicationYear} — есть более новая версия рекомендаций, смотрите с поправкой.` : lecture.publicationYear ? `Лекция ${lecture.publicationYear} года.` : "Дата лекции в источнике не указана — проверьте, к какой версии она относится.",
        reasonShown: ["Разбор от авторов рекомендаций", outdated ? "Помечено: может быть устаревшей" : "Соответствует теме"],
        observedAt: null,
        evidence: [factCheck(evidenceFromCatalog(lecture, `Видеолекция РКО: «${lecture.title}»`), { currentness: outdated ? "superseded" : lecture.currentness, editorialStatus: lecture.editorialStatus })],
        source: catalogProvenance(lecture),
        actions: [{ kind: "open_internal", label: "Открыть", href: `/${ctx.specialty}/content/${encodeURIComponent(lecture.id)}`, requiresConfirmation: false }],
        attributes: { outdated },
      });
    }

    const cards = content.filter(item => item.kind === "clinical" && contentMatchesTopics(item, ctx.specialty, [topicId]).length && item.currentness !== "archived").slice(0, 2);
    if (cards.length && (goals.includes("exam_prep") || goals.includes("guideline_refresh"))) {
      push(topicId, "self_check", {
        moduleKey: cards.map(card => card.id).join("+"),
        category: "self_check",
        title: `${label}: самопроверка по ключевым правилам`,
        summary: cards.map(card => card.title).join(" · "),
        reasonShown: ["Короткие структурированные карточки из рекомендаций"],
        observedAt: null,
        evidence: cards.map(card => factCheck(evidenceFromCatalog(card), { currentness: card.currentness, editorialStatus: card.editorialStatus })),
        source: catalogProvenance(cards[0]),
        actions: cards.map(card => ({ kind: "open_internal" as const, label: card.title.length > 40 ? "Карточка" : card.title, href: `/${ctx.specialty}/content/${encodeURIComponent(card.id)}`, requiresConfirmation: false })),
        attributes: {},
      });
    }

    if (goals.includes("nmo_points")) {
      const eventContext: AgentContext = { ...ctx, preference: { ...ctx.preference, topics: [topicId], formats: ctx.profile.preferences.events.formats, horizonDays: Math.max(ctx.preference.horizonDays, 60) } };
      const event = searchEvents(eventContext).find(item => item.record.nmo === "accredited_listing");
      if (event) {
        push(topicId, "event", {
          moduleKey: event.record.id,
          category: "event",
          title: `${label}: мероприятие с НМО — ${event.record.title}`,
          summary: `${eventDateLabel(event.record)} · ${event.record.formatNote}`,
          reasonShown: ["Цель: баллы НМО", ...event.reasons.slice(0, 2)],
          observedAt: event.record.startDate,
          evidence: eventDrafts(eventContext, [event])[0]?.evidence ?? [],
          source: { connectorId: "events-listings", source: event.record.listingName, sourceUrl: event.record.listingUrl, publisher: event.record.organizer, retrievedAt: ctx.nowIso, publishedAt: null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "curated_snapshot" },
          actions: [{ kind: "open_source", label: "Подробнее", href: event.record.listingUrl, requiresConfirmation: false }],
          attributes: {},
        });
      }
    }
  }
  return drafts.sort((a, b) => a.rank - b.rank);
}

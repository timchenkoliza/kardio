import { countLabel, formatDateRu } from "@/lib/agents/format";
import { stableId, truncate } from "@/lib/agents/text";
import type { AgentRun, Evidence } from "@/lib/agents/types";
import { specificTopicTerms, topicById, topicLabels } from "@/lib/agents/vocabulary";
import { conceptsIn, type QueryConcept } from "@/lib/portal/lexicon";
import { jobForRun } from "@/lib/portal/jobs";
import { specialties } from "@/lib/specialty";
import { entrezDate, type PubmedArticle } from "./adapters/pubmed";
import type { AgentContext } from "./context";
import type { ResultDraft } from "./drafts";
import { PlanBuilder, verificationSummary, type ExecutorResult } from "./plan";
import { evidenceFromPubmed, evidenceFromQuote, pubmedProvenance } from "./services/evidence";
import { factCheck } from "./services/fact-check";
import { generateLearningPlan } from "./services/learning";
import { approvedJournals } from "./services/source-policy";
import * as tools from "./tools";
import { titleNamesTopic } from "./topic-match";

/**
 * Learning next best action.
 *
 *   real professional behaviour → repeated interest → concrete opportunity
 *   → recommended next step → reason why → continuation
 *
 * Signals, strongest first: the current request, a topic the physician asked
 * about repeatedly (stored runs), an explicitly chosen topic, a single earlier
 * question, and finally the specialty itself (cold start). The reason shown is
 * always the signal actually used — never «you often ask about X» without the
 * stored runs that prove it.
 */

export type LearningSignalKind = "current_intent" | "repeated_interest" | "explicit_topic" | "recent_question" | "saved_material" | "specialty";

export interface LearningSignal {
  kind: LearningSignalKind;
  concept: QueryConcept | null;
  /** Physician-language reason, built from the evidence of the signal. */
  reason: string;
  /** Dates of the runs behind a behavioural signal. */
  evidenceDates: string[];
}

const REVIEW_TYPES = ["Systematic Review", "Meta-Analysis", "Review", "Practice Guideline"];
const MIN_REPEATS = 2;

function short(date: string): string {
  return formatDateRu(date, { day: "numeric", month: "short" }) ?? date.slice(0, 10);
}

/** Concepts behind the physician's earlier questions, counted per run. */
export function behaviourSignals(history: readonly AgentRun[], specialty: AgentContext["specialty"]): Array<{ concept: QueryConcept; runs: AgentRun[] }> {
  const counts = new Map<string, { concept: QueryConcept; runs: AgentRun[] }>();
  for (const run of history) {
    const text = run.input.text?.trim();
    if (!text || run.status === "blocked" || run.status === "failed") continue;
    if (jobForRun(run) === "learning") continue;
    for (const concept of conceptsIn(text, specialty).filter(item => item.kind === "topic" || item.kind === "concept" || item.kind === "drug")) {
      const entry = counts.get(concept.label) ?? { concept, runs: [] };
      entry.runs.push(run);
      counts.set(concept.label, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.runs.length - a.runs.length || b.runs[0].startedAt.localeCompare(a.runs[0].startedAt));
}

export function chooseLearningSignal(ctx: AgentContext): LearningSignal {
  const specialtyName = specialties[ctx.specialty].name;
  const question = ctx.inputText?.trim();
  if (question) {
    const concept = conceptsIn(question, ctx.specialty).find(item => item.kind === "topic" || item.kind === "concept" || item.kind === "drug") ?? null;
    if (concept) return { kind: "current_intent", concept, reason: `Вы попросили: «${truncate(question, 90)}»`, evidenceDates: [] };
  }
  const behaviour = behaviourSignals(ctx.history, ctx.specialty);
  const repeated = behaviour.find(entry => entry.runs.length >= MIN_REPEATS);
  if (repeated) {
    const dates = repeated.runs.map(run => run.startedAt).sort();
    return { kind: "repeated_interest", concept: repeated.concept, reason: `Вы обращались к теме «${repeated.concept.label}» ${countLabel(repeated.runs.length, ["раз", "раза", "раз"])}: ${[...new Set(dates.map(short))].slice(-3).join(", ")}`, evidenceDates: dates };
  }
  const explicit = ctx.profile.interests.topics.map(id => topicById(ctx.specialty, id)).find(Boolean);
  if (explicit) return { kind: "explicit_topic", concept: { id: `${ctx.specialty}:${explicit.id}`, label: explicit.label, term: explicit.pubmed, kind: "topic" }, reason: `Тема из ваших настроек: ${explicit.label}`, evidenceDates: [] };
  const single = behaviour[0];
  if (single) return { kind: "recent_question", concept: single.concept, reason: `Вы недавно спрашивали о теме «${single.concept.label}» (${short(single.runs[0].startedAt)})`, evidenceDates: [single.runs[0].startedAt] };
  const saved = ctx.materials.map(material => conceptsIn(material.title, ctx.specialty)[0]).find(Boolean);
  if (saved) return { kind: "saved_material", concept: saved, reason: `Вы сохранили материал по теме «${saved.label}»`, evidenceDates: [] };
  return { kind: "specialty", concept: null, reason: `Специальность: ${specialtyName}. Персональных сигналов пока нет — следующий шаг подобран по специальности и уточнится по вашим вопросам`, evidenceDates: [] };
}

function reviewKind(article: PubmedArticle): string {
  if (article.publicationTypes.some(type => /guideline/i.test(type))) return "рекомендации";
  if (article.publicationTypes.includes("Systematic Review") || article.publicationTypes.includes("Meta-Analysis")) return "систематический обзор";
  return "обзор";
}

export async function learning(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const signal = chooseLearningSignal(ctx);
  builder.note("Определили, от чего отталкиваться", signal.reason);
  const drafts: ResultDraft[] = [];

  // Canonical catalog modules where a catalog exists (cardiology): current guideline, lecture, self-check.
  const catalogTopic = signal.concept?.id.startsWith(`${ctx.specialty}:`) ? signal.concept.id.split(":")[1] : null;
  if (ctx.catalog.content.length && catalogTopic) {
    const scoped: AgentContext = { ...ctx, preference: { ...ctx.preference, topics: [catalogTopic], goals: ctx.preference.goals.length ? ctx.preference.goals : ["guideline_refresh"] } };
    const modules = builder.record("Подобрали материалы каталога по теме", await tools.generateLearningPlan(scoped), items => countLabel(items.length, ["модуль", "модуля", "модулей"]));
    drafts.push(...modules.slice(0, 3).map(module => ({ ...module, reasonShown: [signal.reason, ...module.reasonShown.slice(0, 1)], attributes: { ...module.attributes, signal: signal.kind } })));
  }

  // A recent review or guideline to read next — live, for every specialty.
  // Cold start reads systematic reviews and guidelines whose title is about the specialty.
  // A review is a step «по теме», only when its title names the topic (not a more specific one): an abstract that
  // mentions hypertension does not make a schistosomiasis review a step in the hypertension route.
  const term = signal.concept ? signal.concept.term.replace(/\[tiab\]/g, "[ti]") : tools.specialtyScopeTerm(ctx);
  const types = signal.concept ? REVIEW_TYPES : ["Systematic Review", "Practice Guideline", "Guideline"];
  const minDate = entrezDate(new Date(Date.UTC(ctx.now.getUTCFullYear() - 3, ctx.now.getUTCMonth(), ctx.now.getUTCDate())));
  const maxDate = entrezDate(ctx.now);
  const sort = signal.concept ? "relevance" as const : "pub_date" as const;
  let reviews = builder.record("Искали свежие обзоры в журналах, одобренных врачами", await tools.searchPubmed(ctx, { term, minDate, maxDate, retmax: 3, journals: approvedJournals(), publicationTypes: types, sort }), items => countLabel(items.length, ["обзор", "обзора", "обзоров"]));
  if (!reviews.length && builder.toolsUsed.at(-1)?.status === "ok") {
    reviews = builder.record("Расширили поиск обзоров на все журналы", await tools.searchPubmed(ctx, { term, minDate, maxDate, retmax: 3, publicationTypes: types, sort }), items => countLabel(items.length, ["обзор", "обзора", "обзоров"]));
  }
  if (signal.concept) {
    const concept = signal.concept;
    const offTopic = reviews.filter(article => !titleNamesTopic(article.title, concept.term, specificTopicTerms(ctx.specialty)));
    if (offTopic.length) builder.note("Отложили обзоры о другой теме", `${countLabel(offTopic.length, ["обзор", "обзора", "обзоров"])} — в названии нет темы «${concept.label}» или в нём более узкая тема: ${offTopic.slice(0, 2).map(article => `«${truncate(article.title, 90)}»`).join("; ")}`);
    reviews = reviews.filter(article => !offTopic.includes(article));
  }
  const abstracts = reviews.length ? builder.record("Прочитали, о чём обзор", await tools.readAbstracts(ctx, reviews.slice(0, 2).map(article => article.pmid)), items => countLabel(items.filter(item => item.conclusion).length, ["вывод", "вывода", "выводов"])) : [];
  const firstSignalAt = signal.evidenceDates[0] ?? null;
  for (const [index, article] of reviews.slice(0, 2).entries()) {
    const abstract = abstracts.find(item => item.pmid === article.pmid);
    const evidence: Evidence[] = [factCheck(evidenceFromPubmed(article, ctx.nowIso))];
    if (abstract?.conclusion) {
      const quoted = evidenceFromQuote({ connectorId: "pubmed", sourceName: `${article.journal} · ${article.sortDate?.slice(0, 4) ?? ""}`.trim(), sourceUrl: article.url, publisher: article.journalFull ?? article.journal, retrievedAt: ctx.nowIso, publishedAt: article.sortDate, claim: abstract.conclusion, quote: abstract.sections.find(section => section.label === abstract.conclusionLabel)?.text ?? abstract.conclusion, quoteLanguage: "en", quoteKind: "verbatim", level: "peer_reviewed", secondary: false, verifyIn: null, dataOrigin: "runtime_api" });
      evidence.unshift(factCheck({ ...quoted, provenance: { ...quoted.provenance, journal: article.journal } }));
    }
    // Opportunity: the review appeared after the physician first asked about the topic.
    const gap = firstSignalAt && article.sortDate && article.sortDate > firstSignalAt.slice(0, 10) ? "Обзор вышел после вашего первого вопроса по теме" : null;
    const key = stableId("learning", "review", article.pmid);
    drafts.push({
      key,
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "learning_module",
      category: "review",
      title: `Прочитать ${reviewKind(article)}: ${truncate(article.title, 180)}`,
      summary: [article.journal, article.pubDate].filter(Boolean).join(" · "),
      reasonShown: [signal.reason, gap ?? (signal.concept ? `Тема: ${signal.concept.label}` : "Свежий обзор по специальности")].filter(Boolean),
      observedAt: article.sortDate,
      evidence,
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [{ kind: "open_source", label: "Открыть обзор", href: article.url, requiresConfirmation: false }, { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false }],
      attributes: { step: "review", signal: signal.kind, topic: signal.concept?.label ?? null, gap, done: ctx.profile.learningProgress[`${ctx.agentId}:${key}`] === "done", order: index },
      partner: null,
      rank: drafts.length + 1,
    });
  }

  const checked = builder.record("Проверили версии и источники", await tools.factCheck(drafts), items => verificationSummary(items));
  const done = checked.filter(item => item.attributes.done === true).length;
  const synthesis = checked.length
    ? `Следующий шаг: ${checked[0].title.replace(/^Прочитать /u, "прочитать ").replace(/[.\s]+$/u, "")}. Почему: ${signal.reason.replace(/\.$/u, "")}.${done ? ` Пройдено ${done} из ${checked.length}.` : ""}`
    : `Подходящих материалов не нашлось. Почему искали так: ${signal.reason.replace(/\.$/u, "")}. Попробуйте назвать тему, которую хотите освежить.`;
  const topicsLine = ctx.profile.interests.topics.length ? topicLabels(ctx.specialty, ctx.profile.interests.topics).join(", ") : null;
  if (signal.kind === "specialty" && !topicsLine) builder.notices.push("Добавьте одну тему — следующий шаг станет точнее");
  return { intent: ctx.job ?? "plan_learning", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts: checked, synthesis, notices: builder.notices };
}

/** Kept for the canonical catalog route (cardiology): the module builder behind the next step. */
export { generateLearningPlan };

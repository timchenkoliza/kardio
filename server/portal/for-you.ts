import { DRUG_CHANGE_LABEL, formatDateRu } from "@/lib/agents/format";
import { withNewFlags } from "@/lib/agents/profile";
import type { AgentId, AgentResult, AgentRun, DrugChangeType, Material, UserProfile } from "@/lib/agents/types";
import { topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { stateForOrigin, type ForYouCard, type ForYouKind } from "@/lib/portal/cards";
import { askHref } from "@/lib/portal/jobs";
import { EXAMPLE_DISCLOSURE, EXAMPLE_SPONSOR, PLACEMENT_FORMATS } from "@/lib/pharma/placement-formats";
import { kindLabel } from "@/lib/ui/labels";
import { specialties } from "@/lib/specialty";
import { currentResults } from "@/server/agents/workspace";
import { evidenceEligibleCatalog } from "@/server/agents/services/search";

/**
 * «Для вас» read model. Mixes updates, guideline and drug signals, one
 * learning next step, a saved-topic continuation, upcoming events and — only
 * where a disclosed partner format exists — one partner card. Order follows
 * value to the physician: new items first; partner material never leads.
 */

export interface ForYouView {
  cards: ForYouCard[];
  previousVisitAt: string | null;
  newCount: number;
  /** Sources behind the cards, for the freshness line. */
  personalised: boolean;
  topics: string[];
}

const FEED_AGENTS: readonly AgentId[] = ["whats_new", "guidelines", "drugs", "events"];
const MAX_CARDS = 10;

function freshness(origin: AgentResult["source"]["dataOrigin"], retrievedAt: string): string {
  const date = formatDateRu(retrievedAt, { day: "numeric", month: "short" }) ?? retrievedAt.slice(0, 10);
  if (origin === "runtime_api") return `получено ${date}`;
  if (origin === "curated_snapshot") return `снимок от ${date}`;
  if (origin === "catalog_snapshot") return `каталог от ${date}`;
  return date;
}

function kindFor(result: AgentResult): ForYouKind {
  if (result.kind === "event") return "event";
  if (result.kind === "drug_change") return "drug_signal";
  if (result.kind === "guideline_change") return "guideline";
  if (result.kind === "learning_module") return "learning";
  return "publication";
}

const LABEL: Record<ForYouKind, string> = {
  publication: "Новая публикация",
  guideline: "Рекомендации",
  drug_signal: "Препараты",
  event: "Событие",
  learning: "Следующий шаг в обучении",
  saved_topic: "Ваши материалы",
  catalog: "Рекомендации специальности",
  partner: "Партнёрский материал",
};

function whyItMatters(result: AgentResult): string | null {
  if (result.kind === "drug_change") {
    const impact = result.attributes["drugAssessment.practiceImpact"];
    if (typeof impact === "string" && impact) return impact;
    return result.category && result.category in DRUG_CHANGE_LABEL ? DRUG_CHANGE_LABEL[result.category as DrugChangeType].title : null;
  }
  if (result.kind === "guideline_change") {
    if (result.category === "guideline_publication") return typeof result.attributes.studyType === "string" ? `${result.attributes.studyType}, опубликованные за последние два года` : null;
    if (typeof result.attributes.deltas === "string" && result.attributes.deltas) return result.attributes.deltas;
    return "Новая версия рекомендаций может изменить практику";
  }
  if (result.kind === "update" && typeof result.attributes.studyType === "string") return result.attributes.studyType;
  if (result.kind === "learning_module" && typeof result.attributes.gap === "string") return result.attributes.gap;
  if (result.kind === "event") return [result.attributes.format, result.attributes.nmo === true ? "в списке аккредитованных НМО" : null].filter(Boolean).join(" · ") || null;
  return null;
}

function primaryFor(result: AgentResult, specialty: SpecialtyId): ForYouCard["primary"] {
  const internal = result.actions.find(action => action.kind === "open_internal" && action.href);
  if (internal?.href) return { label: "Открыть", href: internal.href, external: false };
  const source = result.actions.find(action => action.kind === "open_source" && action.href);
  if (result.kind === "event") return { label: "Подробнее", href: source?.href ?? askHref(specialty, { job: "events" }), external: Boolean(source?.href) };
  if (source?.href) return { label: source.label, href: source.href, external: true };
  return { label: "Открыть", href: askHref(specialty, { run: result.runId }), external: false };
}

export function resultCard(result: AgentResult & { newSinceLastSeen?: boolean }, specialty: SpecialtyId, isNew: boolean): ForYouCard {
  const kind = kindFor(result);
  const topicAttr = typeof result.attributes.topic === "string" ? result.attributes.topic : null;
  return {
    id: result.id,
    kind,
    label: kind === "publication" && typeof result.attributes.studyType === "string" ? result.attributes.studyType : result.kind === "drug_change" && result.category && result.category in DRUG_CHANGE_LABEL ? DRUG_CHANGE_LABEL[result.category as DrugChangeType].title : LABEL[kind],
    title: result.title,
    summary: result.summary || null,
    whyItMatters: whyItMatters(result),
    whyShown: [isNew ? "Новое с вашего прошлого визита" : null, result.reasonShown[0] ?? null].filter(Boolean).join(" · ") || `Специальность: ${specialties[specialty].name}`,
    source: { name: result.source.source, url: result.source.sourceUrl, state: stateForOrigin(result.source.dataOrigin), freshness: freshness(result.source.dataOrigin, result.source.retrievedAt) },
    date: result.observedAt,
    topic: topicAttr,
    isNew,
    primary: primaryFor(result, specialty),
    next: result.kind === "learning_module" ? { label: "Почему этот шаг", href: askHref(specialty, { run: result.runId }), external: false } : result.kind === "guideline_change" ? { label: "Рекомендации по теме", href: askHref(specialty, { job: "guidelines" }), external: false } : null,
    resultId: result.id,
    partner: null,
  };
}

function catalogCards(content: readonly ContentObject[], specialty: SpecialtyId, topics: readonly string[], seen: Set<string>): ForYouCard[] {
  if (!specialties[specialty].catalog) return [];
  const eligible = evidenceEligibleCatalog(content).filter(item => item.specialty === specialty && item.kind === "guideline" && item.currentness === "current" && !seen.has(item.title.toLocaleLowerCase("ru-RU")));
  return eligible
    .sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0) || b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(item => ({
      id: `catalog-${item.id}`,
      kind: "catalog" as const,
      label: kindLabel[item.kind],
      title: item.title,
      summary: item.summary,
      whyItMatters: item.publicationYear ? `Актуальная версия ${item.publicationYear} года по данным источника` : null,
      whyShown: topics.length ? `Темы из настроек: ${topicLabels(specialty, topics).slice(0, 2).join(", ")}` : `Специальность: ${specialties[specialty].name}`,
      source: { name: item.source.name, url: item.canonicalUrl, state: "SNAPSHOT" as const, freshness: "каталог специальности" },
      date: item.publicationDate ?? (item.publicationYear ? String(item.publicationYear) : null),
      topic: null,
      isNew: false,
      primary: { label: "Открыть", href: `/${specialty}/content/${encodeURIComponent(item.id)}`, external: false },
      next: null,
      resultId: null,
      partner: null,
    }));
}

/** The disclosed partner slot: only where a partner format exists for the specialty, never first. */
function partnerCard(profile: UserProfile, specialty: SpecialtyId): ForYouCard | null {
  if (!profile.partnerContent || specialty !== "cardiology") return null;
  const example = PLACEMENT_FORMATS.find(format => format.id === "article")?.example;
  if (example?.type !== "article") return null;
  return {
    id: "partner-article",
    kind: "partner",
    label: "Партнёрский материал",
    title: example.title,
    summary: example.keyPoints.join(" · "),
    whyItMatters: null,
    whyShown: "Партнёрский формат по теме специальности; показан отдельно от источников и не влияет на их порядок",
    source: { name: EXAMPLE_SPONSOR, url: null, state: "MOCK", freshness: "пример формата" },
    date: null,
    topic: null,
    isNew: false,
    primary: { label: "Как устроены партнёрские форматы", href: `/${specialty}/settings#partner`, external: false },
    next: null,
    resultId: null,
    partner: { sponsor: EXAMPLE_SPONSOR, disclosure: EXAMPLE_DISCLOSURE, example: true },
  };
}

export function buildForYou(args: { specialty: SpecialtyId; profile: UserProfile; results: readonly AgentResult[]; runs: readonly AgentRun[]; materials: readonly Material[]; content: readonly ContentObject[]; now?: Date }): ForYouView {
  const { specialty, profile } = args;
  const now = args.now ?? new Date();
  const previousVisitAt = profile.previousVisitAt;
  const latest = new Map<AgentId, AgentRun>();
  for (const run of args.runs) if (run.status !== "running" && !latest.has(run.agentId) && (run.trigger === "schedule_catchup" || run.trigger === "manual" || run.trigger === "configuration")) latest.set(run.agentId, run);
  const isNew = (result: AgentResult) => Boolean(previousVisitAt) && result.createdAt > (previousVisitAt as string);
  const live = (result: AgentResult) => result.kind !== "event" || typeof result.attributes.endDate !== "string" || new Date(`${result.attributes.endDate}T23:59:59Z`).getTime() >= now.getTime();

  const organic = withNewFlags(FEED_AGENTS.flatMap(agentId => currentResults(args.results.filter(result => result.agentId === agentId), latest.get(agentId) ?? null)), profile)
    .filter(result => !result.partner && !result.dismissed && live(result) && result.category !== "needs_check");
  const seen = new Set<string>();
  const unique = organic.filter(result => {
    const key = result.title.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // New first, then the freshest; events keep their own slot below.
  const updates = unique.filter(result => result.kind !== "event")
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)) || (b.observedAt ?? "").localeCompare(a.observedAt ?? "") || a.rank - b.rank)
    .map(result => resultCard(result, specialty, isNew(result)));
  const events = unique.filter(result => result.kind === "event")
    .sort((a, b) => String(a.attributes.startDate ?? "").localeCompare(String(b.attributes.startDate ?? "")))
    .slice(0, 1)
    .map(result => resultCard(result, specialty, isNew(result)));

  const learningRun = args.runs.find(run => run.agentId === "learning" && run.status !== "running");
  // The learning step should add something: skip a reading already shown as an update card.
  const shownUrls = new Set(updates.map(card => card.source.url).filter(Boolean));
  const learning = learningRun ? currentResults(args.results.filter(result => result.agentId === "learning"), learningRun).filter(result => result.attributes.done !== true && !shownUrls.has(result.source.sourceUrl)).sort((a, b) => a.rank - b.rank)[0] : undefined;
  const learningCard = learning ? resultCard(learning, specialty, false) : null;

  const savedCard: ForYouCard | null = args.materials.length ? {
    id: "saved-continuation",
    kind: "saved_topic",
    label: LABEL.saved_topic,
    title: `Сохранено материалов: ${args.materials.length}`,
    summary: args.materials.slice(0, 2).map(material => material.title).join(" · "),
    whyItMatters: null,
    whyShown: "Вы сохраняли эти материалы",
    source: { name: "Мои материалы", url: null, state: "LIVE", freshness: `последний — ${formatDateRu(args.materials[0].createdAt, { day: "numeric", month: "short" }) ?? ""}` },
    date: args.materials[0].createdAt,
    topic: null,
    isNew: false,
    primary: { label: "Продолжить", href: `/${specialty}/materials`, external: false },
    next: null,
    resultId: null,
    partner: null,
  } : null;

  const fill = updates.length < 4 ? catalogCards(args.content, specialty, profile.interests.topics, seen) : [];
  const partner = partnerCard(profile, specialty);

  const ordered: ForYouCard[] = [];
  const queue = [...updates, ...fill];
  while (ordered.length < MAX_CARDS && queue.length) {
    ordered.push(queue.shift() as ForYouCard);
    if (ordered.length === 2 && partner) ordered.push(partner);
    if (ordered.length === 3 && learningCard) ordered.push(learningCard);
  }
  if (partner && !ordered.includes(partner) && ordered.length >= 1) ordered.push(partner);
  if (learningCard && !ordered.includes(learningCard)) ordered.push(learningCard);
  ordered.push(...events);
  if (savedCard) ordered.push(savedCard);

  return {
    cards: ordered,
    previousVisitAt,
    newCount: ordered.filter(card => card.isNew).length,
    personalised: profile.interests.topics.length > 0,
    topics: topicLabels(specialty, profile.interests.topics),
  };
}

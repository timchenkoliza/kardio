import { preferenceFor } from "@/lib/feed/feedback";
import { DRUG_CHANGE_LABEL, formatDateRu } from "@/lib/agents/format";
import { withNewFlags } from "@/lib/agents/profile";
import type { AgentId, AgentResult, AgentRun, DrugChangeType, Material, UserProfile } from "@/lib/agents/types";
import { topicById, topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { mediaKey, selectCardMedia } from "@/lib/media/derivatives";
import { stateForOrigin, type ForYouCard, type ForYouKind } from "@/lib/portal/cards";
import { askHref, type PortalJob } from "@/lib/portal/jobs";
import { showcaseById, showcaseFor, type ShowcaseItem } from "@/lib/portal/showcase";
import { EXAMPLE_DISCLOSURE, EXAMPLE_SPONSOR, PLACEMENT_FORMATS } from "@/lib/pharma/placement-formats";
import { isRussian, localizeItem, physicianSafe, publicationFacts, trustLabel } from "@/lib/presentation/physician";
import { artForTopics } from "@/lib/ui/feed-art";
import { kindLabel } from "@/lib/ui/labels";
import { specialties } from "@/lib/specialty";
import { currentResults } from "@/server/agents/workspace";
import { evidenceEligibleCatalog } from "@/server/agents/services/search";

/**
 * «Для вас» read model. Mixes updates, guideline and drug signals, one
 * learning next step, a saved-topic continuation, upcoming events and — only
 * where a disclosed partner format exists — one partner card. Order follows
 * value to the physician: new items first; partner material never leads.
 *
 * Every card passes the physician presentation layer before it is rendered:
 * a Russian title and summary (the source wording only behind «Оригинал»),
 * Russian tags, an editorial source label, a picture from the media policy
 * (approved derivative → in-house art → none, lib/media/derivatives.ts), and
 * an internal page that the whole card opens in the same tab. When the live
 * feed of a specialty is short it is completed with «Подборка редакции» —
 * real documents with real links, labelled as a selection, never as new.
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
/** Below this many live cards the specialty selection completes the feed. */
const LIVE_TARGET = 5;

export function itemHref(specialty: SpecialtyId, id: string): string {
  return `/${specialty}/item/${encodeURIComponent(id)}`;
}

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
  showcase: "Подборка",
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
  if (result.kind === "update" && typeof result.attributes.studyType === "string") return `${result.attributes.studyType} в журнале, одобренном врачами`;
  if (result.kind === "learning_module" && typeof result.attributes.gap === "string") return result.attributes.gap;
  if (result.kind === "event") return [result.attributes.format, result.attributes.nmo === true ? "в списке аккредитованных НМО" : null].filter(Boolean).join(" · ") || null;
  return null;
}

/** The internal page a card opens: the result's own page, or the catalog document. */
function internalHref(result: AgentResult, specialty: SpecialtyId): string {
  const internal = result.actions.find(action => action.kind === "open_internal" && action.href);
  return internal?.href ?? itemHref(specialty, result.id);
}

/** External first source: only an explicit «Открыть первоисточник ↗» may open it. */
function sourceUrl(result: AgentResult): string | null {
  const source = result.actions.find(action => action.kind === "open_source" && action.href && !/cr\.minzdrav\.gov\.ru\/?$/u.test(action.href));
  return source?.href ?? result.source.sourceUrl ?? null;
}

function sourceName(result: AgentResult): string {
  const journal = typeof result.attributes.journal === "string" ? result.attributes.journal : null;
  if (result.source.connectorId === "pubmed" && journal) return journal;
  return result.source.source;
}

/**
 * New tasks on the card's topic, offered on the material page. Each starts a
 * NEW search on the topic and says so; none of them acts on the material
 * itself (there is no «Кратко»: the material page is the short form, and
 * nothing here can honestly shorten a source further).
 */
export function scenariosFor(kind: ForYouKind, topic: string): ForYouCard["scenarios"] {
  if (!topic) return [];
  if (kind === "event" || kind === "partner" || kind === "saved_topic") return [];
  if (kind === "drug_signal") return [
    { label: "Справка по препарату", job: "drug" as PortalJob, text: topic },
    { label: "Исследования по теме", job: "research" as PortalJob, text: topic },
  ];
  return [
    { label: "Исследования по теме", job: "research" as PortalJob, text: topic },
    { label: "Рекомендации по теме", job: "guidelines" as PortalJob, text: topic },
  ];
}

export function resultCard(result: AgentResult & { newSinceLastSeen?: boolean }, specialty: SpecialtyId, isNew: boolean, options: { used?: Set<string> } = {}): ForYouCard {
  const kind = kindFor(result);
  // A topic stored by its vocabulary id («ah») is shown by its name.
  const topicAttr = typeof result.attributes.topic === "string" ? topicById(specialty, result.attributes.topic)?.label ?? result.attributes.topic : null;
  const label = kind === "publication" && typeof result.attributes.studyType === "string" ? result.attributes.studyType : result.kind === "drug_change" && result.category && result.category in DRUG_CHANGE_LABEL ? DRUG_CHANGE_LABEL[result.category as DrugChangeType].title : LABEL[kind];
  // Only a topic the result states names its subject: the specialty is not what an unrecognised document is about.
  const localized = localizeItem({ title: result.title, summary: result.summary, typeLabel: label, topic: topicAttr, tags: topicAttr ? [topicAttr] : [] });
  const why = physicianSafe(whyItMatters(result));
  const href = internalHref(result, specialty);
  const state = stateForOrigin(result.source.dataOrigin);
  const topic = topicAttr ?? localized.tags[0] ?? (localized.basis === "template" ? "" : localized.title);
  const media = result.kind === "event" ? null : selectCardMedia({
    specialty,
    text: [result.title, result.summary, localized.title, ...localized.tags].join(" "),
    kind: result.kind,
    art: specialty === "cardiology" ? null : artForTopics(localized.tags),
    used: options.used,
  });
  return {
    id: result.id,
    kind,
    label,
    title: localized.title,
    summary: localized.summary ?? (localized.basis === "source" || localized.basis === "curated" ? null : publicationFacts({ title: localized.original?.title ?? result.title, journal: typeof result.attributes.journal === "string" ? result.attributes.journal : null, abstract: result.evidence.find(item => item.supportText)?.supportText ?? null })),
    whyItMatters: why && isRussian(why) ? why : null,
    whyShown: physicianSafe([isNew ? "Новое с вашего прошлого визита" : null, result.reasonShown[0] ?? null].filter(Boolean).join(" · ")) || `Специальность: ${specialties[specialty].name}`,
    source: { name: sourceName(result), url: sourceUrl(result), state, freshness: freshness(result.source.dataOrigin, result.source.retrievedAt) },
    date: result.observedAt,
    topic: topicAttr,
    isNew,
    primary: { label: "Открыть", href, external: false },
    next: result.kind === "learning_module" ? { label: "Почему этот шаг", href: askHref(specialty, { run: result.runId }), external: false } : null,
    resultId: result.id,
    partner: null,
    href,
    original: localized.original ? { title: localized.original.title, summary: localized.original.summary } : null,
    tags: localized.tags,
    media,
    trust: trustLabel(state),
    scenarios: scenariosFor(kind, topic),
    showcase: false,
  };
}

/** A catalog document as a card. Its own asset (a source image) is never the card picture: the media policy decides. */
export function catalogCard(item: ContentObject, specialty: SpecialtyId, topics: readonly string[], used?: Set<string>): ForYouCard {
  const href = `/${specialty}/content/${encodeURIComponent(item.id)}`;
  const tags = [...item.topics, ...item.tags].filter(isRussian).slice(0, 3);
  return {
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
    primary: { label: "Открыть", href, external: false },
    next: null,
    resultId: null,
    partner: null,
    href,
    original: null,
    tags,
    media: selectCardMedia({ specialty, text: [item.title, item.summary, ...item.tags, ...item.topics].join(" "), kind: item.kind, used }),
    trust: trustLabel("SNAPSHOT"),
    scenarios: scenariosFor("catalog", tags[0] ?? item.title),
    showcase: false,
  };
}

function catalogCards(content: readonly ContentObject[], specialty: SpecialtyId, topics: readonly string[], seen: Set<string>, used: Set<string>): ForYouCard[] {
  if (!specialties[specialty].catalog) return [];
  const eligible = evidenceEligibleCatalog(content).filter(item => item.specialty === specialty && item.kind === "guideline" && item.currentness === "current" && !seen.has(item.title.toLocaleLowerCase("ru-RU")));
  return eligible
    .sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0) || b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(item => catalogCard(item, specialty, topics, used));
}

export function showcaseCard(item: ShowcaseItem, used?: Set<string>): ForYouCard {
  const href = itemHref(item.specialty, item.id);
  return {
    id: item.id,
    kind: "showcase",
    label: item.typeLabel,
    title: item.title,
    summary: item.summary,
    whyItMatters: item.whyImportant,
    whyShown: `Подборка редакции по специальности «${specialties[item.specialty].name}»`,
    source: { name: item.publisher, url: item.url, state: "SNAPSHOT", freshness: "подборка редакции" },
    date: item.date,
    topic: item.topic,
    isNew: false,
    primary: { label: "Открыть", href, external: false },
    next: null,
    resultId: null,
    partner: null,
    href,
    original: { title: item.originalTitle, summary: null },
    tags: [...item.tags],
    media: selectCardMedia({ specialty: item.specialty, text: [item.title, item.summary, ...item.tags, item.topic].join(" "), kind: item.kind, art: item.art, used }),
    trust: trustLabel("SNAPSHOT", { showcase: true }),
    scenarios: scenariosFor("showcase", item.topic),
    showcase: true,
  };
}

export function showcaseCardById(specialty: SpecialtyId, id: string): ForYouCard | null {
  const item = showcaseById(id);
  return item && item.specialty === specialty ? showcaseCard(item) : null;
}

/** The disclosed partner slot: only where a partner format exists for the specialty, never first. */
function partnerCard(profile: UserProfile, specialty: SpecialtyId): ForYouCard | null {
  if (!profile.partnerContent || specialty !== "cardiology") return null;
  const example = PLACEMENT_FORMATS.find(format => format.id === "article")?.example;
  if (example?.type !== "article") return null;
  const href = `/${specialty}/settings#partner`;
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
    primary: { label: "Как устроены партнёрские форматы", href, external: false },
    next: null,
    resultId: null,
    partner: { sponsor: EXAMPLE_SPONSOR, disclosure: EXAMPLE_DISCLOSURE, example: true },
    href,
    original: null,
    tags: [],
    media: null,
    trust: trustLabel("MOCK", { partner: true }),
    scenarios: [],
    showcase: false,
  };
}

/** Neighbouring cards never repeat a picture (alternatives are chosen at selection); every sixth illustrated card stays text-only. */
function varyMedia(cards: ForYouCard[]): ForYouCard[] {
  // One picture is shown once per feed: a repeat reads as filler, so the later card goes text-only.
  const used = new Set<string>();
  let illustrated = 0;
  return cards.map(card => {
    const key = mediaKey(card.media);
    if (!key) return card;
    illustrated += 1;
    if (used.has(key) || illustrated % 6 === 0) return { ...card, media: null };
    used.add(key);
    return card;
  });
}

export function buildForYou(args: { specialty: SpecialtyId; profile: UserProfile; results: readonly AgentResult[]; runs: readonly AgentRun[]; materials: readonly Material[]; content: readonly ContentObject[]; now?: Date }): ForYouView {
  const { specialty, profile } = args;
  const now = args.now ?? new Date();
  const previousVisitAt = profile.previousVisitAt;
  const latest = new Map<AgentId, AgentRun>();
  for (const run of args.runs) if (run.status !== "running" && !latest.has(run.agentId) && (run.trigger === "schedule_catchup" || run.trigger === "manual" || run.trigger === "configuration")) latest.set(run.agentId, run);
  const isNew = (result: AgentResult) => Boolean(previousVisitAt) && result.createdAt > (previousVisitAt as string);
  const live = (result: AgentResult) => result.kind !== "event" || typeof result.attributes.endDate !== "string" || new Date(`${result.attributes.endDate}T23:59:59Z`).getTime() >= now.getTime();

  // A switched-off check («Выключить проверку») contributes nothing to «Для вас».
  const enabled = (agentId: AgentId) => profile.subscriptions[agentId]?.enabled !== false;
  const organic = withNewFlags(FEED_AGENTS.filter(enabled).flatMap(agentId => currentResults(args.results.filter(result => result.agentId === agentId), latest.get(agentId) ?? null)), profile)
    .filter(result => !result.partner && !result.dismissed && live(result) && result.category !== "needs_check");
  const seen = new Set<string>();
  const unique = organic.filter(result => {
    const key = result.title.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // New first, then the freshest; events keep their own slot below.
  // One set per page: a later card about the same subject takes another approved derivative, its art, or none.
  const used = new Set<string>();
  // «интересно / не то» reorders within «new» and «earlier»; it never hides what a check found (D1).
  const preference = (result: AgentResult) => preferenceFor(profile.feedback, result);
  const updates = unique.filter(result => result.kind !== "event")
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)) || preference(b).score - preference(a).score || (b.observedAt ?? "").localeCompare(a.observedAt ?? "") || a.rank - b.rank)
    .map(result => {
      const card = resultCard(result, specialty, isNew(result), { used });
      const because = preference(result).because;
      return because ? { ...card, whyShown: `${card.whyShown} · ${because}` } : card;
    });
  const events = unique.filter(result => result.kind === "event")
    .sort((a, b) => String(a.attributes.startDate ?? "").localeCompare(String(b.attributes.startDate ?? "")))
    .slice(0, 1)
    .map(result => resultCard(result, specialty, isNew(result), { used }));

  // The feed's learning step is the background check's, not an answer to a learning question (N-08).
  const learningRun = enabled("learning") ? args.runs.find(run => run.agentId === "learning" && run.status !== "running" && run.trigger !== "composer") : undefined;
  // The learning step should add something: skip a reading already shown as an update card.
  const shownUrls = new Set(updates.map(card => card.source.url).filter(Boolean));
  const learning = learningRun ? currentResults(args.results.filter(result => result.agentId === "learning"), learningRun).filter(result => result.attributes.done !== true && !shownUrls.has(result.source.sourceUrl)).sort((a, b) => a.rank - b.rank)[0] : undefined;
  const learningCard = learning ? resultCard(learning, specialty, false, { used }) : null;

  const savedHref = `/${specialty}/materials`;
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
    primary: { label: "Продолжить", href: savedHref, external: false },
    next: null,
    resultId: null,
    partner: null,
    href: savedHref,
    original: null,
    tags: [],
    media: null,
    trust: { label: "Ваша библиотека", tone: "trusted" },
    scenarios: [],
    showcase: false,
  } : null;

  const fill = updates.length < 4 ? catalogCards(args.content, specialty, profile.interests.topics, seen, used) : [];
  const shown = new Set([...updates, ...fill].map(card => card.source.url).filter(Boolean));
  const selection = updates.length + fill.length < LIVE_TARGET
    ? showcaseFor(specialty).filter(item => !shown.has(item.url)).slice(0, Math.max(3, LIVE_TARGET + 1 - updates.length - fill.length)).map(item => showcaseCard(item, used))
    : [];
  const partner = partnerCard(profile, specialty);

  const ordered: ForYouCard[] = [];
  const queue = [...updates, ...fill, ...selection];
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
    cards: varyMedia(ordered),
    previousVisitAt,
    newCount: ordered.filter(card => card.isNew).length,
    personalised: profile.interests.topics.length > 0,
    topics: topicLabels(specialty, profile.interests.topics),
  };
}

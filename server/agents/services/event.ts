import { daysUntil, formatDateRu, plural } from "@/lib/agents/format";
import { stableId } from "@/lib/agents/text";
import type { EventFormatPref } from "@/lib/agents/types";
import { topicLabels } from "@/lib/agents/vocabulary";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { EVENT_RECORDS, EVENTS_SNAPSHOT_RETRIEVED_AT, type EventRecord } from "../snapshots/events";
import { evidenceFromQuote } from "./evidence";
import { factCheck } from "./fact-check";

/**
 * EventService: search → normalize → rank → explain relevance. Registration
 * is never faked: without an organizer integration the next action is a
 * confirmed hand-off to the registration page.
 */

export interface NormalizedEvent {
  record: EventRecord;
  score: number;
  reasons: string[];
  matchedTopics: string[];
  formatMatches: EventFormatPref[];
  inDays: number;
}

function formatMatches(record: EventRecord, formats: readonly EventFormatPref[]): EventFormatPref[] {
  return formats.filter(format => {
    if (format === "online") return record.online;
    if (format === "international") return record.region === "international";
    if (format === "moscow") return record.region === "moscow" && record.inPerson;
    if (format === "spb") return record.region === "spb" && record.inPerson;
    return record.region === "regions" && record.inPerson;
  });
}

function organizerSource(record: EventRecord): string {
  if (record.organizer === "РКО") return "rko";
  if (record.organizer.includes("European Society of Cardiology")) return "esc";
  if (record.organizer.includes("American Heart Association")) return "aha";
  return "other";
}

export function searchEvents(ctx: AgentContext, records: readonly EventRecord[] = EVENT_RECORDS): NormalizedEvent[] {
  if (ctx.specialty !== "cardiology") return [];
  const { topics, formats, horizonDays, trustedSources, excludedSources } = ctx.preference;
  const results: NormalizedEvent[] = [];
  for (const record of records) {
    const inDays = daysUntil(record.endDate, ctx.now);
    const startsIn = daysUntil(record.startDate, ctx.now);
    if (inDays < 0 || startsIn > horizonDays) continue;
    const source = organizerSource(record);
    if (excludedSources.includes(source)) continue;
    const matchedFormats = formats.length ? formatMatches(record, formats) : [];
    if (formats.length && !matchedFormats.length) continue;
    const matchedTopics = topics.filter(topic => record.topics.includes(topic));
    if (topics.length && !matchedTopics.length) continue;

    const reasons: string[] = [];
    let score = 0;
    if (matchedTopics.length) { score += 6 * matchedTopics.length; reasons.push(`Тема: ${topicLabels(ctx.specialty, matchedTopics).join(", ")}`); }
    if (matchedFormats.length) { score += 3; reasons.push(record.formatNote); }
    if (trustedSources.includes(source)) { score += 3; reasons.push(`${record.organizer} в доверенных`); }
    if (record.nmo === "accredited_listing") { score += 2; reasons.push("В списке мероприятий, аккредитованных в НМО"); }
    score += Math.max(0, 4 - Math.floor(Math.max(startsIn, 0) / 15));
    reasons.push(startsIn <= 0 ? "Идёт сейчас" : `Через ${startsIn} ${plural(startsIn, ["день", "дня", "дней"])}`);
    results.push({ record, score, reasons, matchedTopics, formatMatches: matchedFormats, inDays: startsIn });
  }
  return results.sort((a, b) => b.score - a.score || a.record.startDate.localeCompare(b.record.startDate) || a.record.id.localeCompare(b.record.id));
}

export function eventDateLabel(record: EventRecord): string {
  const start = formatDateRu(record.startDate, { day: "numeric", month: "long" }) ?? record.startDate;
  const end = formatDateRu(record.endDate, { day: "numeric", month: "long" }) ?? record.endDate;
  const year = record.startDate.slice(0, 4);
  return `${record.startDate === record.endDate ? start : `${start} — ${end}`} ${year}`;
}

export function eventDrafts(ctx: AgentContext, events: readonly NormalizedEvent[]): ResultDraft[] {
  return events.map(event => {
    const { record } = event;
    const claim = `${record.title}: ${eventDateLabel(record)}, ${record.city ?? "город не указан"}, ${record.formatNote.toLocaleLowerCase("ru-RU")}`;
    const support = `${record.title}. ${eventDateLabel(record)}. ${record.city ?? ""}. ${record.formatNote}. ${record.organizer}`;
    const evidence = factCheck(evidenceFromQuote({
      connectorId: "events-listings",
      sourceName: record.listingName,
      sourceUrl: record.listingUrl,
      publisher: record.organizer,
      retrievedAt: EVENTS_SNAPSHOT_RETRIEVED_AT,
      publishedAt: null,
      claim,
      quote: support,
      quoteLanguage: "ru",
      quoteKind: "page_extract",
      level: "event_listing",
      secondary: false,
      verifyIn: null,
    }), { dateUncertain: !record.yearStatedOnSource });
    if (!record.yearStatedOnSource) {
      evidence.verificationNote = [evidence.verificationNote, "Год на странице-агрегаторе не указан — проверьте дату у организатора"].filter(Boolean).join(". ");
    }
    const registrationHref = record.registrationUrl ?? record.listingUrl;
    return {
      key: stableId("event", record.id),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "event" as const,
      category: record.region,
      title: record.title,
      summary: `${eventDateLabel(record)} · ${record.city ?? "город не указан"} · ${record.formatNote}`,
      reasonShown: event.reasons,
      observedAt: record.startDate,
      evidence: [evidence],
      source: {
        connectorId: "events-listings",
        source: record.listingName,
        sourceUrl: record.listingUrl,
        publisher: record.organizer,
        retrievedAt: EVENTS_SNAPSHOT_RETRIEVED_AT,
        publishedAt: null,
        version: null,
        ownership: "PUBLIC_SOURCE" as const,
        dataOrigin: "curated_snapshot" as const,
      },
      actions: [
        { kind: "open_source", label: "Подробнее", href: record.listingUrl, requiresConfirmation: false },
        { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
        { kind: "calendar", label: "Добавить в календарь", href: null, requiresConfirmation: true },
        { kind: "registration", label: "Перейти к регистрации", href: registrationHref, requiresConfirmation: true },
      ],
      attributes: {
        startDate: record.startDate,
        endDate: record.endDate,
        city: record.city,
        region: record.region,
        online: record.online,
        inPerson: record.inPerson,
        format: record.formatNote,
        organizer: record.organizer,
        nmo: record.nmo === "accredited_listing",
        yearStated: record.yearStatedOnSource,
        registrationUrl: registrationHref,
        listingUrl: record.listingUrl,
        inDays: event.inDays,
      },
      partner: null,
      rank: 0,
    };
  });
}

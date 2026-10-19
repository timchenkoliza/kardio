import { CARDIO_PARTNER_FORMATS, type CardioPartnerFormat } from "@/lib/demo/cardio-partner-formats";
import { stableId } from "@/lib/agents/text";
import type { SpecialtyId } from "@/lib/domain/types";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";

/**
 * Partner / pharma content uses the same provenance model but is never mixed
 * into organic evidence: it is matched only by configured professional topics,
 * ranked separately and always labelled «Партнёрский материал».
 */

export interface PartnerChannel {
  id: string;
  sponsor: string;
  specialtyTags: SpecialtyId[];
  synthetic: boolean;
}

export interface PartnerContentItem {
  id: string;
  channelId: string;
  format: CardioPartnerFormat;
  topicTags: string[];
  specialtyTags: SpecialtyId[];
  sourceOwnership: "PARTNER_SOURCE";
  sponsorDisclosure: { sponsor: string; label: string; disclosure: string; synthetic: boolean };
}

const TOPIC_TAGS: Record<string, string[]> = {
  "partner-rx-utility": ["ah", "hf"],
  "partner-rx-case": ["af"],
  "partner-hcp-tool": ["arrhythmia", "af"],
  "partner-disease-education": ["cardiorenal", "hf"],
  "partner-otc-hcp": ["ah", "prevention"],
};

export const PARTNER_CHANNELS: readonly PartnerChannel[] = CARDIO_PARTNER_FORMATS.map(format => ({ id: `channel-${format.id}`, sponsor: format.sponsor, specialtyTags: ["cardiology"], synthetic: true }));

export const PARTNER_CONTENT: readonly PartnerContentItem[] = CARDIO_PARTNER_FORMATS.map(format => ({
  id: format.id,
  channelId: `channel-${format.id}`,
  format,
  topicTags: TOPIC_TAGS[format.id] ?? [],
  specialtyTags: ["cardiology"],
  sourceOwnership: "PARTNER_SOURCE",
  sponsorDisclosure: { sponsor: format.sponsor, label: "Партнёрский материал", disclosure: format.disclosure, synthetic: format.legalMode === "prototype_only" || /синтетическ/u.test(format.disclosure) },
}));

/** matchPartnerContent(): at most one item, only on explicit topic overlap. */
export function matchPartnerContent(ctx: AgentContext): ResultDraft[] {
  if (!ctx.profile.partnerContent || ctx.specialty !== "cardiology") return [];
  const topics = ctx.preference.topics;
  if (!topics.length) return [];
  const match = PARTNER_CONTENT
    .map(item => ({ item, overlap: item.topicTags.filter(tag => topics.includes(tag)) }))
    .filter(entry => entry.overlap.length > 0 && entry.item.specialtyTags.includes(ctx.specialty))
    .sort((a, b) => b.overlap.length - a.overlap.length || a.item.id.localeCompare(b.item.id))[0];
  if (!match) return [];
  const { item } = match;
  return [{
    key: stableId("partner", ctx.agentId, item.id),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "partner",
    category: item.format.kind,
    title: item.format.title,
    summary: item.format.summary,
    reasonShown: ["Совпадает с темой в ваших настройках", "Показывается отдельно от доказательной выдачи"],
    observedAt: null,
    evidence: [],
    source: { connectorId: "partner-channel", source: item.sponsorDisclosure.sponsor, sourceUrl: null, publisher: item.sponsorDisclosure.sponsor, retrievedAt: ctx.nowIso, publishedAt: null, version: null, ownership: "PARTNER_SOURCE", dataOrigin: "synthetic_fixture" },
    actions: [],
    attributes: { eyebrow: item.format.eyebrow, brand: item.format.brand, legalMode: item.format.legalMode },
    partner: item.sponsorDisclosure,
    rank: 1000,
  }];
}

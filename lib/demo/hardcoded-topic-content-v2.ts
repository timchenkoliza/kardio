import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { EDITORIAL_COPY_V2, editorialCopySourceLabel } from "@/lib/demo/editorial-copy-v2";

const FALLBACK_TOPICS: Record<SpecialtyId, readonly string[]> = {
  cardiology: [
    "Артериальная гипертензия",
    "Ишемическая болезнь сердца",
    "Сердечная недостаточность",
    "Фибрилляция предсердий",
    "Нарушения ритма",
    "Клапанные пороки сердца",
    "Кардиомиопатии",
    "Дислипидемия и профилактика",
    "Кардиоваскулярная визуализация",
    "Интервенционная кардиология",
  ],
  oncology: [
    "Рак молочной железы",
    "Рак лёгкого",
    "Колоректальный рак",
    "Рак предстательной железы",
    "Рак шейки матки",
    "Рак желудка",
    "Рак мочевого пузыря",
    "Меланома",
    "Поддерживающая терапия",
    "Иммунотерапия и биомаркеры",
  ],
};

function normalizeTopicKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function contentType(kind: ContentObject["kind"]): string {
  if (kind === "guideline") return "Разбор рекомендаций";
  if (kind === "clinical") return "Клиническая карточка";
  if (kind === "video") return "Короткий разбор";
  return "Обзор исследований";
}

export function hardcodedEditorialSource(specialty: SpecialtyId): Source {
  return {
    id: `hardcoded-editorial-${specialty}`,
    specialty,
    name: editorialCopySourceLabel(specialty),
    type: "Редакционный черновик",
    publisher: "Kardio",
    url: null,
    trustStatus: "requires_review",
    commercialStatus: "non_commercial",
    metadataCompleteness: 100,
    notes: "Prototype copy. Not source-validated; requires editorial and clinical review before external publication.",
    lastCheckedAt: null,
  };
}

export function topicLabelsForHardcodedExpansion(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[],
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const add = (raw: string | null | undefined) => {
    const label = raw?.trim();
    if (!label) return;
    const key = normalizeTopicKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  };

  for (const item of existingContent) add(item.topics.at(-1));
  for (const topic of FALLBACK_TOPICS[specialty]) add(topic);
  return labels;
}

export function hardcodedTopicContent(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[] = [],
): ContentObject[] {
  const source = hardcodedEditorialSource(specialty);
  const topics = topicLabelsForHardcodedExpansion(specialty, existingContent);

  return topics.flatMap(topic => {
    const topicHash = stableHash(`${specialty}:${normalizeTopicKey(topic)}`);
    return EDITORIAL_COPY_V2.map((blueprint, index): ContentObject => ({
      id: `hardcoded-${specialty}-${topicHash}-${String(index + 1).padStart(2, "0")}`,
      specialty,
      kind: blueprint.kind,
      type: contentType(blueprint.kind),
      title: blueprint.title(topic),
      summary: blueprint.summary(topic),
      sourceId: source.id,
      source,
      canonicalUrl: null,
      publicationDate: null,
      publicationYear: null,
      updatedAt: null,
      lastCheckedAt: null,
      language: "ru",
      topics: [topic],
      tags: [topic, ...blueprint.tags, "hardcoded-copy", "copy-v2"],
      currentness: "review",
      requiresReview: true,
      freshness: "prototype_copy",
      version: "copy-v2",
      parentId: null,
      supersedesId: null,
      supersededById: null,
      trustLayer: "user-added",
      editorialStatus: "prototype_hardcoded",
      rightsStatus: "not_applicable",
      priority: 1,
      author: null,
      provenance: {
        type: "hardcoded_editorial_seed",
        asset: null,
        location: "lib/demo/hardcoded-topic-content-v2.ts",
        notes: "Prototype copy only. Not source-validated. Requires editorial and clinician review before publication.",
      },
      asset: null,
    }));
  });
}

export function withHardcodedTopicContent(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[],
): ContentObject[] {
  const existingIds = new Set(existingContent.map(item => item.id));
  const additions = hardcodedTopicContent(specialty, existingContent).filter(item => !existingIds.has(item.id));
  return [...existingContent, ...additions];
}

export const HARD_CODED_UNITS_PER_TOPIC = EDITORIAL_COPY_V2.length;

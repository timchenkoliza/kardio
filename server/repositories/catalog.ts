import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, contentObjects, sources } from "@/db/schema";
import type { Asset, ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { isSpecialty } from "@/lib/specialty";
import { loadGoldenSet, normalizeGoldenSet } from "@/server/ingestion/goldenset";

const sourceTypeLabels: Record<string, string> = {
  pharmacy: "Аптека",
  expert: "Эксперт",
  calculator: "Калькулятор",
  journal: "Журнал",
  peer_reviewed_journal: "Научный журнал",
  portal: "Профессиональный портал",
  guideline_index: "Рекомендации",
  international_guidelines_index: "Международные рекомендации",
  official_professional_society: "Профессиональное общество",
  professional_society: "Профессиональное общество",
  expert_education: "Образование",
  education: "Образование",
  commercial_education: "Образовательная платформа",
  social_channel: "Профессиональный канал",
  unknown: "Источник",
};

let staticCatalogPromise: Promise<{ content: ContentObject[]; sources: Source[] }> | null = null;

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function staticCatalog(): Promise<{ content: ContentObject[]; sources: Source[] }> {
  staticCatalogPromise ??= loadGoldenSet().then(normalizeGoldenSet);
  return staticCatalogPromise;
}

function requireSpecialty(specialty: SpecialtyId): void {
  if (!isSpecialty(specialty)) throw new Error("Unknown specialty");
}

function sourceRecord(row: typeof sources.$inferSelect): Source {
  const copy = { ...row } as Partial<typeof row>;
  delete copy.raw;
  const source = copy as Source;
  return { ...source, type: sourceTypeLabels[source.type] ?? source.type };
}

function assetRecord(row: typeof assets.$inferSelect | null): Asset | null {
  if (!row) return null;
  const copy = { ...row } as Partial<typeof row>;
  delete copy.raw;
  delete copy.specialty;
  delete copy.contentId;
  const asset = copy as Asset;
  return { ...asset, url: asset.status === "verified" && asset.rights === "publishable" ? asset.url : null };
}

async function queryContent(specialty: SpecialtyId, id?: string): Promise<ContentObject[]> {
  requireSpecialty(specialty);
  const rows = await db.select({ content: contentObjects, source: sources, asset: assets }).from(contentObjects)
    .innerJoin(sources, and(eq(sources.specialty, contentObjects.specialty), eq(sources.id, contentObjects.sourceId)))
    .leftJoin(assets, and(eq(assets.specialty, contentObjects.specialty), eq(assets.contentId, contentObjects.id)))
    .where(and(eq(contentObjects.specialty, specialty), id ? eq(contentObjects.id, id) : undefined))
    .orderBy(asc(contentObjects.id));
  return rows.map(({ content, source, asset }) => {
    const copy = { ...content } as Partial<typeof content>;
    delete copy.raw;
    delete copy.datasetId;
    return { ...(copy as Omit<ContentObject, "source" | "asset">), source: sourceRecord(source), asset: assetRecord(asset) };
  });
}

export async function listContent(specialty: SpecialtyId): Promise<ContentObject[]> {
  requireSpecialty(specialty);
  if (!databaseConfigured()) {
    if (specialty !== "cardiology") return [];
    return (await staticCatalog()).content;
  }
  return queryContent(specialty);
}

export async function getContent(specialty: SpecialtyId, id: string): Promise<ContentObject | null> {
  requireSpecialty(specialty);
  if (!databaseConfigured()) {
    if (specialty !== "cardiology") return null;
    return (await staticCatalog()).content.find(item => item.id === id) ?? null;
  }
  return (await queryContent(specialty, id))[0] ?? null;
}

export async function listSources(specialty: SpecialtyId): Promise<Source[]> {
  requireSpecialty(specialty);
  if (!databaseConfigured()) {
    if (specialty !== "cardiology") return [];
    return (await staticCatalog()).sources;
  }
  return (await db.select().from(sources).where(eq(sources.specialty, specialty)).orderBy(asc(sources.name))).map(sourceRecord);
}

export async function getSource(specialty: SpecialtyId, id: string): Promise<Source | null> {
  requireSpecialty(specialty);
  if (!databaseConfigured()) {
    if (specialty !== "cardiology") return null;
    return (await staticCatalog()).sources.find(source => source.id === id) ?? null;
  }
  const row = (await db.select().from(sources).where(and(eq(sources.specialty, specialty), eq(sources.id, id))))[0];
  return row ? sourceRecord(row) : null;
}

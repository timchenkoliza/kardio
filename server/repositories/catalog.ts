import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, contentObjects, sources } from "@/db/schema";
import type { Asset, ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { isSpecialty } from "@/lib/specialty";

function requireSpecialty(specialty: SpecialtyId): void {
  if (!isSpecialty(specialty)) throw new Error("Unknown specialty");
}

function sourceRecord(row: typeof sources.$inferSelect): Source {
  const { raw: _raw, ...source } = row;
  return source;
}

function assetRecord(row: typeof assets.$inferSelect | null): Asset | null {
  if (!row) return null;
  const { raw: _raw, specialty: _specialty, contentId: _contentId, ...asset } = row;
  // Rights policies apply at read time too, including future imported assets.
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
    const { raw: _raw, datasetId: _datasetId, ...fields } = content;
    return { ...fields, source: sourceRecord(source), asset: assetRecord(asset) };
  });
}

export async function listContent(specialty: SpecialtyId): Promise<ContentObject[]> { return queryContent(specialty); }
export async function getContent(specialty: SpecialtyId, id: string): Promise<ContentObject | null> {
  return (await queryContent(specialty, id))[0] ?? null;
}
export async function listSources(specialty: SpecialtyId): Promise<Source[]> {
  requireSpecialty(specialty);
  return (await db.select().from(sources).where(eq(sources.specialty, specialty)).orderBy(asc(sources.name))).map(sourceRecord);
}
export async function getSource(specialty: SpecialtyId, id: string): Promise<Source | null> {
  requireSpecialty(specialty);
  const row = (await db.select().from(sources).where(and(eq(sources.specialty, specialty), eq(sources.id, id))))[0];
  return row ? sourceRecord(row) : null;
}

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shareLinks } from "@/db/agent-schema";
import type { SpecialtyId } from "@/lib/domain/types";
import type { SharedSnapshot } from "@/lib/sharing/types";

/**
 * Shared links. PostgreSQL in production (a link must open on any instance and
 * any device); an in-process map only for local runs without a database —
 * the product does not offer sharing there (sharingAvailable()).
 */

export interface ShareRecord {
  token: string;
  sessionId: string;
  specialty: SpecialtyId;
  sourceId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  payload: SharedSnapshot;
}

export interface ShareStore {
  create(record: ShareRecord): Promise<void>;
  get(token: string): Promise<ShareRecord | null>;
  list(sessionId: string, specialty: SpecialtyId): Promise<ShareRecord[]>;
  revoke(sessionId: string, token: string, at: Date): Promise<boolean>;
  recordOpen(token: string, at: Date): Promise<void>;
}

class PostgresShareStore implements ShareStore {
  async create(record: ShareRecord) {
    await db.insert(shareLinks).values({ token: record.token, sessionId: record.sessionId, specialty: record.specialty, kind: record.payload.kind, sourceId: record.sourceId, createdAt: new Date(record.createdAt), expiresAt: new Date(record.expiresAt), payload: record.payload });
  }

  async get(token: string) {
    const [row] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
    return row ? toRecord(row) : null;
  }

  async list(sessionId: string, specialty: SpecialtyId) {
    const rows = await db.select().from(shareLinks).where(and(eq(shareLinks.sessionId, sessionId), eq(shareLinks.specialty, specialty))).orderBy(desc(shareLinks.createdAt)).limit(50);
    return rows.map(toRecord);
  }

  async revoke(sessionId: string, token: string, at: Date) {
    const rows = await db.update(shareLinks).set({ revokedAt: at }).where(and(eq(shareLinks.token, token), eq(shareLinks.sessionId, sessionId))).returning({ token: shareLinks.token });
    return rows.length > 0;
  }

  async recordOpen(token: string, at: Date) {
    await db.update(shareLinks).set({ openCount: sql`${shareLinks.openCount} + 1`, lastOpenedAt: at }).where(eq(shareLinks.token, token));
  }
}

function toRecord(row: typeof shareLinks.$inferSelect): ShareRecord {
  return { token: row.token, sessionId: row.sessionId, specialty: row.specialty, sourceId: row.sourceId, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null, openCount: row.openCount, lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null, payload: row.payload };
}

class MemoryShareStore implements ShareStore {
  private readonly records = new Map<string, ShareRecord>();
  async create(record: ShareRecord) { this.records.set(record.token, structuredClone(record)); }
  async get(token: string) { const record = this.records.get(token); return record ? structuredClone(record) : null; }
  async list(sessionId: string, specialty: SpecialtyId) { return [...this.records.values()].filter(record => record.sessionId === sessionId && record.specialty === specialty).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(record => structuredClone(record)); }
  async revoke(sessionId: string, token: string, at: Date) { const record = this.records.get(token); if (!record || record.sessionId !== sessionId) return false; record.revokedAt = at.toISOString(); return true; }
  async recordOpen(token: string, at: Date) { const record = this.records.get(token); if (record) { record.openCount += 1; record.lastOpenedAt = at.toISOString(); } }
}

const globals = globalThis as unknown as { kardioShareStore?: ShareStore & { kind: "postgres" | "memory" } };

export function shareStore(): ShareStore {
  const expected = process.env.DATABASE_URL?.trim() ? "postgres" : "memory";
  if (!globals.kardioShareStore || globals.kardioShareStore.kind !== expected) {
    globals.kardioShareStore = Object.assign(expected === "postgres" ? new PostgresShareStore() : new MemoryShareStore(), { kind: expected as "postgres" | "memory" });
  }
  return globals.kardioShareStore;
}

/** A link must open on every instance: on serverless deployments only PostgreSQL qualifies. */
export function sharingAvailable(): boolean {
  if (process.env.DATABASE_URL?.trim()) return true;
  return !process.env.VERCEL && process.env.KARDIO_REQUIRE_DURABLE_RUNS !== "1";
}

export type ShareState = "active" | "revoked" | "expired" | "missing";

export function shareState(record: ShareRecord | null, now: Date): ShareState {
  if (!record) return "missing";
  if (record.revokedAt) return "revoked";
  if (Date.parse(record.expiresAt) <= now.getTime()) return "expired";
  return "active";
}

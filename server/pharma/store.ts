import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { anonymousSessions } from "@/db/schema";
import type { AccessSubjectId } from "@/lib/access/agent-entitlements";
import type { SpecialtyId, UserState } from "@/lib/domain/types";
import type { ContentStudioPackage, PartnerWorkspaceId } from "@/lib/pharma/content-studio";
import { HttpError } from "@/server/http";

const MAX_PACKAGES_PER_WORKSPACE = 40;

type SessionStateWithContentStudio = UserState & { contentStudioPackages?: ContentStudioPackage[] };

export interface ContentStudioStore {
  readonly kind: "postgres" | "memory";
  listPackages(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId): Promise<ContentStudioPackage[]>;
  getPackage(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId, packageId: string): Promise<ContentStudioPackage | null>;
  savePackage(sessionId: string, pkg: ContentStudioPackage): Promise<void>;
}

function scopedPackages(value: UserState | null | undefined, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId): ContentStudioPackage[] {
  const state = value as SessionStateWithContentStudio | null | undefined;
  return Array.isArray(state?.contentStudioPackages)
    ? state.contentStudioPackages
      .filter(pkg => pkg && pkg.specialty === specialty && pkg.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_PACKAGES_PER_WORKSPACE)
    : [];
}

class MemoryContentStudioStore implements ContentStudioStore {
  readonly kind = "memory" as const;
  private readonly packages = new Map<string, ContentStudioPackage[]>();

  private key(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId) {
    return `${sessionId}:${specialty}:${workspaceId}`;
  }

  async listPackages(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId) {
    return [...(this.packages.get(this.key(sessionId, specialty, workspaceId)) ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getPackage(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId, packageId: string) {
    return (await this.listPackages(sessionId, specialty, workspaceId)).find(pkg => pkg.id === packageId) ?? null;
  }

  async savePackage(sessionId: string, pkg: ContentStudioPackage) {
    const key = this.key(sessionId, pkg.specialty, pkg.workspaceId);
    const current = this.packages.get(key) ?? [];
    const next = [pkg, ...current.filter(item => item.id !== pkg.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_PACKAGES_PER_WORKSPACE);
    this.packages.set(key, next);
  }
}

class PostgresContentStudioStore implements ContentStudioStore {
  readonly kind = "postgres" as const;

  async listPackages(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId) {
    const [record] = await db.select({ state: anonymousSessions.state }).from(anonymousSessions).where(eq(anonymousSessions.id, sessionId));
    return scopedPackages(record?.state, specialty, workspaceId);
  }

  async getPackage(sessionId: string, specialty: SpecialtyId, workspaceId: PartnerWorkspaceId, packageId: string) {
    return (await this.listPackages(sessionId, specialty, workspaceId)).find(pkg => pkg.id === packageId) ?? null;
  }

  async savePackage(sessionId: string, pkg: ContentStudioPackage) {
    await db.transaction(async tx => {
      const [record] = await tx.select().from(anonymousSessions).where(eq(anonymousSessions.id, sessionId)).for("update");
      if (!record) throw new HttpError(401, "Сессия завершена. Обновите страницу.");
      const currentState = record.state as SessionStateWithContentStudio;
      const all = Array.isArray(currentState.contentStudioPackages) ? currentState.contentStudioPackages : [];
      const sameWorkspace = all.filter(item => item.specialty === pkg.specialty && item.workspaceId === pkg.workspaceId);
      const scoped = [pkg, ...sameWorkspace.filter(item => item.id !== pkg.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_PACKAGES_PER_WORKSPACE);
      const untouched = all.filter(item => item.specialty !== pkg.specialty || item.workspaceId !== pkg.workspaceId);
      const nextState = { ...record.state, contentStudioPackages: [...scoped, ...untouched] };
      await tx.update(anonymousSessions).set({ state: nextState, updatedAt: new Date() }).where(eq(anonymousSessions.id, sessionId));
    });
  }
}

const globals = globalThis as unknown as { kardioContentStudioStore?: ContentStudioStore };

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function contentStudioStore(): ContentStudioStore {
  const expected = databaseConfigured() ? "postgres" : "memory";
  if (!globals.kardioContentStudioStore || globals.kardioContentStudioStore.kind !== expected) {
    globals.kardioContentStudioStore = expected === "postgres" ? new PostgresContentStudioStore() : new MemoryContentStudioStore();
  }
  return globals.kardioContentStudioStore;
}

export function contentStudioWorkspaceIdForSubject(subjectId: AccessSubjectId): PartnerWorkspaceId | null {
  return subjectId === "pharma_demo" || subjectId === "editorial_demo" || subjectId === "admin_demo" ? "partner_demo" : null;
}

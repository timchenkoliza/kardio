import type { SpecialtyId } from "@/lib/domain/types";
import { MemoryWorkspaceStore } from "./memory";
import { decodeProfileMirror, markRehydrated } from "./mirror";
import { PostgresWorkspaceStore } from "./postgres";
import type { WorkspaceStore } from "./types";

const globals = globalThis as unknown as { kardioWorkspaceStore?: WorkspaceStore };

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function workspaceStore(): WorkspaceStore {
  const expected = databaseConfigured() ? "postgres" : "memory";
  if (!globals.kardioWorkspaceStore || globals.kardioWorkspaceStore.kind !== expected) {
    globals.kardioWorkspaceStore = expected === "postgres" ? new PostgresWorkspaceStore() : new MemoryWorkspaceStore();
  }
  return globals.kardioWorkspaceStore;
}

/**
 * In memory mode, restore a profile from the browser mirror when this
 * instance has never seen the session (cold start / another instance).
 */
export async function restoreFromMirror(sessionId: string | null, specialty: SpecialtyId, mirror: string | undefined): Promise<boolean> {
  if (!sessionId || !mirror) return false;
  const store = workspaceStore();
  if (store.kind !== "memory") return false;
  if (await store.getProfile(sessionId, specialty)) return false;
  const profile = decodeProfileMirror(mirror, specialty);
  if (!profile) return false;
  await store.saveProfile(sessionId, profile);
  markRehydrated(sessionId, specialty);
  return true;
}

import type { ExperienceManifest, ManifestModule, ModuleFamily } from "./manifest";

/**
 * A bounded change between two validated manifests of the same run.
 *
 * A later source result — or a refinement of the result («оставь только
 * российские источники») — changes only the modules it affects: everything
 * else is listed as preserved and keeps its identity (module id), so the
 * renderer reconciles in place: the input and its draft, navigation, already
 * shown modules, source links, saved state stay as they are. Only validated
 * manifests are ever diffed: nothing speculative is shown and revised later.
 *
 * v0.2 adds the parent version, per-module detail and the reason (which
 * intent delta, which evidence). Module id lists keep their v0.1 shape.
 */
export const PATCH_SCHEMA = "kardio.experience-patch/0.2" as const;

export type ModuleField = "title" | "emphasis" | "collapsed" | "claims" | "documents" | "props" | "results";

export interface ModulePatch {
  moduleId: string;
  family: ModuleFamily;
  /** For an update: which visible parts changed. For an addition: every part. */
  fields: ModuleField[];
  claimsAdded: number;
  claimsRemoved: number;
}

/** What moved the experience. */
export interface PatchReason {
  kind: "source_result" | "final" | "refinement";
  /** The refinement asked for (kind + parameters, never the physician's text). */
  intentDelta: { kind: string; params: Record<string, string | number | boolean | null> } | null;
  /** Evidence the change depends on: requirements touched, documents and claims kept/added. */
  affectedEvidence: { requirements: string[]; documentIds: string[]; claimIds: string[] };
  /** Did this patch need a new source call (or was it answered from the evidence graph)? */
  retrieval: boolean;
}

export interface ExperiencePatch {
  schema?: typeof PATCH_SCHEMA;
  runId: string;
  /** The manifest version this patch applies to (absent on v0.1 patches). */
  parentManifestVersion?: number;
  manifestVersion: number;
  modulesAdded: string[];
  modulesUpdated: string[];
  modulesRemoved: string[];
  preservedModules: string[];
  /** Per-module detail of what was added or updated (v0.2). */
  changes?: ModulePatch[];
  reason?: PatchReason;
  /** Run status after this patch. */
  status: "running" | "partial" | "completed" | "failed" | "blocked";
}

const FIELDS: ReadonlyArray<[ModuleField, (entry: ManifestModule) => unknown]> = [
  ["title", entry => entry.title],
  ["emphasis", entry => entry.emphasis],
  ["collapsed", entry => entry.collapsed],
  ["claims", entry => entry.claimIds],
  ["documents", entry => entry.documentIds],
  ["results", entry => entry.resultKeys],
  ["props", entry => entry.props],
];

function changedFields(before: ManifestModule | undefined, after: ManifestModule): ModuleField[] {
  return FIELDS.filter(([, read]) => !before || JSON.stringify(read(before)) !== JSON.stringify(read(after))).map(([field]) => field);
}

export function diffManifests(previous: ExperienceManifest | null, next: ExperienceManifest, args: { runId: string; manifestVersion: number; status: ExperiencePatch["status"]; parentManifestVersion?: number; reason?: PatchReason }): ExperiencePatch {
  const before = new Map((previous?.modules ?? []).map(entry => [entry.id, entry]));
  const after = new Map(next.modules.map(entry => [entry.id, entry]));
  const modulesAdded: string[] = [];
  const modulesUpdated: string[] = [];
  const preservedModules: string[] = [];
  const changes: ModulePatch[] = [];
  for (const entry of next.modules) {
    const old = before.get(entry.id);
    const fields = changedFields(old, entry);
    if (!old) modulesAdded.push(entry.id);
    else if (fields.length) modulesUpdated.push(entry.id);
    else { preservedModules.push(entry.id); continue; }
    const oldClaims = new Set(old?.claimIds ?? []);
    const newClaims = new Set(entry.claimIds);
    changes.push({ moduleId: entry.id, family: entry.family, fields, claimsAdded: entry.claimIds.filter(id => !oldClaims.has(id)).length, claimsRemoved: (old?.claimIds ?? []).filter(id => !newClaims.has(id)).length });
  }
  const modulesRemoved = [...before.keys()].filter(id => !after.has(id));
  return {
    schema: PATCH_SCHEMA,
    runId: args.runId,
    parentManifestVersion: args.parentManifestVersion ?? Math.max(0, args.manifestVersion - 1),
    manifestVersion: args.manifestVersion,
    modulesAdded,
    modulesUpdated,
    modulesRemoved,
    preservedModules,
    changes,
    ...(args.reason ? { reason: args.reason } : {}),
    status: args.status,
  };
}

export function isEmptyPatch(patch: ExperiencePatch): boolean {
  return !patch.modulesAdded.length && !patch.modulesUpdated.length && !patch.modulesRemoved.length;
}

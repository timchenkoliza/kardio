import type { ExperienceManifest, ManifestModule } from "./manifest";

/**
 * A bounded change between two validated manifests of the same run.
 *
 * A later source result changes only the modules it affects: everything else
 * is listed as preserved and keeps its identity (module id), so the renderer
 * reconciles in place — the input, navigation, already shown modules, source
 * links and interaction state stay as they are. Only validated manifests are
 * ever diffed: nothing speculative is shown and revised later.
 */
export interface ExperiencePatch {
  runId: string;
  manifestVersion: number;
  modulesAdded: string[];
  modulesUpdated: string[];
  modulesRemoved: string[];
  preservedModules: string[];
  /** Run status after this patch. */
  status: "running" | "partial" | "completed" | "failed" | "blocked";
}

/** The part of a module that the physician can see; ids and order are compared separately. */
function visible(entry: ManifestModule): string {
  return JSON.stringify([entry.family, entry.title, entry.emphasis, entry.collapsed, entry.claimIds, entry.documentIds, entry.resultKeys, entry.props]);
}

export function diffManifests(previous: ExperienceManifest | null, next: ExperienceManifest, args: { runId: string; manifestVersion: number; status: ExperiencePatch["status"] }): ExperiencePatch {
  const before = new Map((previous?.modules ?? []).map(entry => [entry.id, entry]));
  const after = new Map(next.modules.map(entry => [entry.id, entry]));
  const modulesAdded: string[] = [];
  const modulesUpdated: string[] = [];
  const preservedModules: string[] = [];
  for (const entry of next.modules) {
    const old = before.get(entry.id);
    if (!old) modulesAdded.push(entry.id);
    else if (visible(old) !== visible(entry)) modulesUpdated.push(entry.id);
    else preservedModules.push(entry.id);
  }
  const modulesRemoved = [...before.keys()].filter(id => !after.has(id));
  return { runId: args.runId, manifestVersion: args.manifestVersion, modulesAdded, modulesUpdated, modulesRemoved, preservedModules, status: args.status };
}

export function isEmptyPatch(patch: ExperiencePatch): boolean {
  return !patch.modulesAdded.length && !patch.modulesUpdated.length && !patch.modulesRemoved.length;
}

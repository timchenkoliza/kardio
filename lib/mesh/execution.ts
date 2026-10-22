import type { EvidenceGraph } from "./evidence";
import type { FlowTrace } from "./flow-runtime";
import type { ExperienceManifest } from "./manifest";
import type { ExecutionClass, SkillMode } from "./skills/types";

/**
 * The record of how a run was executed — stored with the run, never shown
 * as such. It is what fast-path vs dynamic latency, shadow comparisons and
 * Skill learning are measured from.
 */

export interface ShadowSide {
  modules: string[];
  /** Content modules (evidence-bearing), in order. */
  contentModules: string[];
  claimsShown: number;
  documents: number;
  /** Sources that returned documents. */
  sourcesOk: string[];
  /** Sources that failed, timed out or were unavailable. */
  sourcesFailed: string[];
  /** Claims a source does not support that reached a module (must be 0). */
  unsupportedShown: number;
  fallback: boolean;
  durationMs: number;
  branches: string[];
}

export interface ShadowComparison {
  skillId: string;
  version: string;
  flowId: string;
  at: string;
  generic: ShadowSide;
  skill: ShadowSide;
  lostModules: string[];
  addedModules: string[];
  lostSources: string[];
  addedSources: string[];
  /** pass: the Skill is never worse than the generic path on any protected dimension. */
  verdict: "pass" | "fail";
  reasons: string[];
}

export interface RunExecution {
  class: Exclude<ExecutionClass, "clarify">;
  /** Physician-language line of what is done (never a Skill id). */
  explanation: string | null;
  skill: { id: string; version: string; mode: SkillMode; confidence: number; reasons: string[] } | null;
  alternatives: Array<{ id: string; confidence: number }>;
  flow: FlowTrace | null;
  /** Text-free request signature (job, nosology, entity kinds). */
  signature: string;
  resolution: { entities: string[]; from: "session" | "clarification" } | null;
  /** The Skill path failed and the generic path answered. */
  fallback: { reason: string } | null;
  /** Shadow comparison (while the Skill is not primary, or as a post-promotion check). */
  shadow: ShadowComparison | null;
  timings: { totalMs: number; firstModuleMs: number | null };
}

const CONTENT = new Set(["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "event_list", "learning_next_step"]);

export function shadowSide(manifest: ExperienceManifest, graph: EvidenceGraph, args: { durationMs: number; branches?: string[] }): ShadowSide {
  const claims = new Map(graph.claims.map(claim => [claim.id, claim]));
  const shown = new Set(manifest.modules.flatMap(entry => entry.claimIds));
  const sourcesOk = [...new Set(graph.sources.filter(source => source.outcome === "ok").map(source => source.id))];
  const sourcesFailed = [...new Set(graph.sources.filter(source => source.outcome === "failed" || source.outcome === "unavailable" || (source.invoked && source.status === "LIMITED" && source.outcome !== "ok")).map(source => source.id))];
  return {
    modules: manifest.modules.map(entry => entry.family),
    contentModules: manifest.modules.filter(entry => CONTENT.has(entry.family)).map(entry => entry.family),
    claimsShown: shown.size,
    documents: graph.documents.length,
    sourcesOk,
    sourcesFailed,
    unsupportedShown: [...shown].filter(id => claims.get(id)?.verification === "UNSUPPORTED").length,
    fallback: manifest.compiler.fallback,
    durationMs: args.durationMs,
    branches: args.branches ?? [],
  };
}

/**
 * Differential verdict: the Skill must keep every content module and every
 * answering source of the generic path, show no unsupported claim, and not
 * fall back where the generic path did not. Additions are allowed (and are
 * the point of a Skill); latency is reported, not judged here.
 */
export function compareShadow(args: { skillId: string; version: string; flowId: string; at: string; generic: ShadowSide; skill: ShadowSide }): ShadowComparison {
  const { generic, skill } = args;
  const lostModules = generic.contentModules.filter(family => !skill.contentModules.includes(family));
  const addedModules = skill.contentModules.filter(family => !generic.contentModules.includes(family));
  const lostSources = generic.sourcesOk.filter(id => !skill.sourcesOk.includes(id));
  const addedSources = skill.sourcesOk.filter(id => !generic.sourcesOk.includes(id));
  const reasons: string[] = [];
  if (lostModules.length) reasons.push(`lost_modules:${lostModules.join(",")}`);
  if (lostSources.length) reasons.push(`lost_sources:${lostSources.join(",")}`);
  if (skill.unsupportedShown > 0) reasons.push(`unsupported_claims:${skill.unsupportedShown}`);
  if (skill.fallback && !generic.fallback) reasons.push("skill_fallback");
  if (skill.claimsShown < generic.claimsShown && !addedModules.length) reasons.push(`fewer_claims:${generic.claimsShown}->${skill.claimsShown}`);
  return { ...args, lostModules, addedModules, lostSources, addedSources, verdict: reasons.length ? "fail" : "pass", reasons };
}

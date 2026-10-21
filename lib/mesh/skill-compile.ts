import { compileExperience, type CompileInput, type CompileOutput } from "./compiler";
import type { EvidenceGraph } from "./evidence";
import { runFlow, type FlowRun } from "./flow-runtime";
import type { ManifestExecution, ModuleFamily } from "./manifest";
import type { IntentFlow, IntentSkill } from "./skills/types";

type Scalar = string | number | boolean | null | string[];

/**
 * Compile an experience with a Skill's experience policy and its Flow's
 * directives. Any failure — a flow error or a manifest the policy gates
 * reject — falls back to the generic compile of the same evidence (the
 * Intent → Evidence → Experience path), and says why.
 */

export function executionRecord(skill: IntentSkill | null, flow: FlowRun | null): ManifestExecution {
  if (!skill) return { class: "dynamic", explanation: null, skill: null, flow: null };
  return { class: "skill", explanation: skill.experiencePolicy.explanation, skill: { id: skill.id, version: skill.version, mode: skill.rollout.mode }, flow: flow ? { id: flow.trace.flowId, version: flow.trace.version, branches: flow.trace.branches.slice(0, 12) } : null };
}

function mergeProps(...sets: Array<Partial<Record<ModuleFamily, Record<string, Scalar>>> | undefined>): Partial<Record<ModuleFamily, Record<string, Scalar>>> {
  const out: Partial<Record<ModuleFamily, Record<string, Scalar>>> = {};
  for (const set of sets) for (const [family, props] of Object.entries(set ?? {}) as Array<[ModuleFamily, Record<string, Scalar>]>) out[family] = { ...(out[family] ?? {}), ...props };
  return out;
}

export function compileWithSkill(base: Omit<CompileInput, "graph">, graph: EvidenceGraph, skill: IntentSkill, flowDefinition: IntentFlow | null, extra: { moduleProps?: CompileInput["moduleProps"]; priorityClaims?: readonly string[]; view?: CompileInput["view"] } = {}): { output: CompileOutput; flow: FlowRun | null; graph: EvidenceGraph; fallback: string | null } {
  try {
    const flow = flowDefinition ? runFlow(flowDefinition, skill, graph) : null;
    const shaped: EvidenceGraph = flow?.directives.gaps.length ? { ...graph, gaps: [...new Set([...graph.gaps, ...flow.directives.gaps])] } : graph;
    const output = compileExperience({
      ...base,
      graph: shaped,
      takeaway: flow?.directives.takeaway ?? null,
      priorityClaims: [...(extra.priorityClaims ?? []), ...(flow?.directives.priorityClaims ?? [])],
      moduleProps: mergeProps(flow?.directives.moduleProps, extra.moduleProps),
      execution: executionRecord(skill, flow),
      view: extra.view ?? null,
    });
    if (output.fallback) {
      const generic = compileExperience({ ...base, graph, moduleProps: extra.moduleProps ?? {}, priorityClaims: extra.priorityClaims ?? [], execution: executionRecord(null, null), view: extra.view ?? null });
      if (!generic.fallback) return { output: generic, flow, graph, fallback: `skill_compile:${output.manifest.compiler.warnings[0]?.split(":")[0] ?? "policy"}` };
    }
    return { output, flow, graph: shaped, fallback: null };
  } catch (error) {
    return { output: compileExperience({ ...base, graph, moduleProps: extra.moduleProps ?? {}, priorityClaims: extra.priorityClaims ?? [], execution: executionRecord(null, null), view: extra.view ?? null }), flow: null, graph, fallback: `skill_error:${error instanceof Error ? error.message.slice(0, 60) : "unknown"}` };
  }
}

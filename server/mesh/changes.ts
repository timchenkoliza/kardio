import { decideRelease } from "@/control-plane/lib/decision";
import { validateExperienceContract } from "@/control-plane/lib/experience";
import { evaluateManifestAgainstChange } from "@/control-plane/lib/manifest";
import type { ChangeCause, ChangeContract, ExperienceContract, ExperienceSample, GateResult, ObligationEvaluation, ReleaseDecision, RiskAssessment } from "@/control-plane/lib/model";
import { evaluateNegativeObligations } from "@/control-plane/lib/obligations";
import { classifyRisk } from "@/control-plane/lib/risk";
import type { ExperienceManifest } from "@/lib/mesh/manifest";
import type { PolicyFinding } from "@/lib/mesh/policies";
import { experienceSample, toControlPlaneManifest } from "@/lib/mesh/projection";
import type { SourceDescriptor } from "@/lib/mesh/sources";
import { fingerprint } from "./fingerprint";
import type { DeltaReport, RegenerationReport } from "./knowledge";
import { recordMeshEvent } from "./telemetry";

/**
 * Change integration: knowledge, policy and experience movements become
 * Changes in the Control Plane — with both risk axes (R*, E*), explicit
 * negative obligations and a release decision. Nothing here applies a
 * change to production; it records, evaluates and recommends.
 */

export interface MeshChange {
  contract: ChangeContract;
  createdAt: string;
  evaluation: ChangeEvaluation | null;
}

export interface ChangeEvaluation {
  assessment: RiskAssessment;
  obligations: ObligationEvaluation;
  manifestChecks: Array<{ manifest: string; valid: boolean; errors: string[] }>;
  gates: GateResult[];
  decision: ReleaseDecision;
}

const globals = globalThis as unknown as { kardioChangeLog?: MeshChange[] };

export function changeLog(): MeshChange[] {
  if (!globals.kardioChangeLog) globals.kardioChangeLog = [];
  return globals.kardioChangeLog;
}

/** A stable version of the source policies, so «source_policy unchanged» is checkable. */
export function sourcePolicyVersion(descriptors: readonly SourceDescriptor[]): string {
  return fingerprint(JSON.stringify(descriptors.map(descriptor => [descriptor.id, descriptor.usagePolicy, descriptor.specialties, descriptor.provides])));
}

function representationOf(manifest: ExperienceManifest) {
  return toControlPlaneManifest(manifest).representation.primary;
}

function refreshContract(primaryJob: string | undefined, before: ExperienceManifest | undefined): ExperienceContract {
  return {
    user_visible: true,
    ...(primaryJob ? { primary_job: primaryJob } : {}),
    impact_triggers: [],
    capability_transition: "none",
    module: { strategy: "reuse", allowed_modules: ["evidence_answer"], forbidden_modules: [] },
    representation: { primary: before ? representationOf(before) : "SHORT_TEXT", secondary: [], visualization: "forbidden", text_summary: "required", semantic_equivalence_required: true, accessibility_fallback_required: true },
    stable_shell: { navigation_landmarks_unchanged: true, action_semantics_unchanged: true, factual_meaning_unchanged: true, safety_thresholds_unchanged: true },
    personalization: { mode: "none", inferred_traits_expire: true, sensitive_traits_forbidden: true },
    onboarding: { meaningful_capability_transition: false, required_when_relevant: false, dismissal_respected: true, mastery_suppresses_future_guides: true },
    cache: { blueprint_cacheable: true, invalidation_triggers: ["source_document_fingerprint_changed"] },
  };
}

export async function createSourceDeltaChange(args: { delta: DeltaReport; regeneration: RegenerationReport; sourceId: string; now: string; sessionId?: string | null }): Promise<MeshChange> {
  const { delta, regeneration } = args;
  const jobs = [...new Set(regeneration.regenerated.map(item => item.before.intent.job))];
  const contract: ChangeContract = {
    change_id: `CHG-${args.now.slice(0, 10)}-source-${fingerprint(`${delta.documentId}|${delta.toVersion}`).slice(7, 15)}`,
    cause: "source_delta",
    status: "PROPOSED",
    title: `Source delta: ${delta.documentId}`,
    problem: { user_segment: "physicians", job: jobs.join(", ") || "reference", observed_failure: "a source document changed after dependent experiences were compiled", evidence: [delta.url, `${delta.fromVersion} → ${delta.toVersion}`] },
    hypothesis: "Regenerating only the affected experiences keeps answers current without changing the job, module families, navigation, source policy or onboarding.",
    target_metric: { name: "stale_experience_exposure", desired_direction: "decrease" },
    guardrails: [{ metric: "unsupported_claim_rate", operator: "==", value: 0 }, { metric: "hidden_conflict_count", operator: "==", value: 0 }],
    semantic_triggers: [],
    requested_rollout_percent: 0,
    kill_criteria: ["unsupported_claim_rate > 0", "a source conflict is hidden", "stable_shell_regression == true"],
    knowledge_delta: {
      sources: [args.sourceId],
      documents: [{ id: delta.documentId, url: delta.url, from_version: delta.fromVersion, to_version: delta.toVersion, chunks_changed: [...delta.chunksChanged, ...delta.chunksAdded, ...delta.chunksRemoved], chunks_total: delta.chunksTotal }],
      claims_added: delta.claimsAdded,
      claims_removed: delta.claimsRemoved,
      claim_kinds: delta.claimKinds,
      entities: delta.entities,
      scenarios_stale: delta.scenariosStale,
      scenarios_untouched: delta.scenariosUntouched.length,
    },
    capability_delta: { capabilities: [], sources_added: [], sources_removed: [], operations: [] },
    experience_delta: {
      manifests_invalidated: delta.experiencesInvalidated,
      manifests_regenerated: regeneration.regenerated.map(item => item.after.id),
      module_families_before: regeneration.regenerated.map(item => item.before.modules.map(entry => entry.family)),
      module_families_after: regeneration.regenerated.map(item => item.after.modules.map(entry => entry.family)),
      order_changed: regeneration.regenerated.some(item => item.before.modules.map(entry => entry.family).filter(family => item.after.modules.some(other => other.family === family)).join() !== item.after.modules.map(entry => entry.family).filter(family => item.before.modules.some(other => other.family === family)).join()),
      representation_changed: regeneration.regenerated.some(item => item.before.representation.mode !== item.after.representation.mode),
    },
    implementation_delta: { files: [] },
    changes: { source_content: true, claims: delta.claimsAdded.length + delta.claimsRemoved.length > 0 },
    does_not_change: { module_family: true, navigation: true, user_job: true, source_policy: true, onboarding: true },
    experience_contract: refreshContract(jobs.length === 1 ? jobs[0] : undefined, regeneration.regenerated[0]?.before),
  };
  const change: MeshChange = { contract, createdAt: args.now, evaluation: null };
  changeLog().push(change);
  await recordMeshEvent(args.sessionId ?? null, "change_created", { changeId: contract.change_id, cause: "source_delta", sourceId: args.sourceId, documentId: delta.documentId, claimsAffected: delta.claimsAdded.length + delta.claimsRemoved.length, scenariosStale: delta.scenariosStale.length });
  return change;
}

/** Evaluate a Change: both risk axes, negative obligations, manifest contract, release decision. */
export async function evaluateChange(change: MeshChange, args: { before: readonly ExperienceSample[]; after: readonly ExperienceSample[]; afterManifests: readonly ExperienceManifest[]; candidate: string; baseline: string; now: string; sessionId?: string | null }): Promise<ChangeEvaluation> {
  const contract = change.contract;
  const assessment = classifyRisk({ contract, changedFiles: contract.implementation_delta?.files ?? [], candidateSha: args.candidate, baselineSha: args.baseline });
  const obligations = evaluateNegativeObligations(contract, args.before, args.after);
  const manifestChecks = args.afterManifests.map(manifest => {
    const check = evaluateManifestAgainstChange({ contract, manifest: toControlPlaneManifest(manifest) });
    return { manifest: manifest.id, valid: check.valid, errors: check.errors };
  });
  const experience = validateExperienceContract(contract);
  const gates: GateResult[] = [
    { gate: "experience_contract", status: experience.valid && manifestChecks.every(check => check.valid) ? "PASS" : "FAIL", candidate_sha: args.candidate, source: "mesh/change-evaluator", summary: [...experience.errors, ...manifestChecks.flatMap(check => check.errors)].join(" | ") || "valid" },
    { gate: "negative_obligations", status: obligations.passed ? "PASS" : "FAIL", candidate_sha: args.candidate, source: "control-plane/obligations", summary: obligations.passed ? `checked: ${obligations.checked.join(", ")}` : obligations.violations.map(item => `${item.obligation}@${item.scenario}: ${item.before} → ${item.after}`).concat(obligations.contradictions.map(key => `contradiction: ${key}`)).join(" | ") },
  ];
  const decision = decideRelease({ assessment, gates, now: args.now });
  const evaluation: ChangeEvaluation = { assessment, obligations, manifestChecks, gates, decision };
  change.evaluation = evaluation;
  change.contract.status = "EVALUATED";
  await recordMeshEvent(args.sessionId ?? null, "change_evaluated", { changeId: contract.change_id, cause: contract.cause ?? "code", riskClass: assessment.risk_class, experienceImpact: assessment.experience_impact, decision: decision.status, violations: obligations.violations.length });
  return evaluation;
}

/**
 * A policy validator's fix suggestions become a proposed Change — never an
 * automatic edit of what physicians see.
 */
export async function changeFromPolicyFindings(args: { findings: readonly PolicyFinding[]; manifest: ExperienceManifest; now: string; sessionId?: string | null }): Promise<MeshChange | null> {
  const fixes = args.findings.filter(item => item.fix);
  if (!fixes.length) return null;
  const causes = fixes.map(item => item.fix!.changeCause);
  const cause: ChangeCause = causes.includes("policy_delta") ? "policy_delta" : causes.includes("source_delta") ? "source_delta" : causes.includes("code") ? "code" : "experience_delta";
  const rules = [...new Set(fixes.map(item => item.rule))];
  const contract: ChangeContract = {
    change_id: `CHG-${args.now.slice(0, 10)}-policy-${fingerprint(`${args.manifest.id}|${rules.join(",")}`).slice(7, 15)}`,
    cause,
    status: "PROPOSED",
    title: `Proposed fix for ${rules.join(", ")}`,
    problem: { user_segment: "physicians", job: args.manifest.intent.job, observed_failure: `policy findings on manifest ${args.manifest.id}`, evidence: fixes.map(item => `${item.rule}: ${item.message}`).slice(0, 8) },
    hypothesis: "Applying the suggested fixes makes the compiled experience pass every policy gate without changing the job or navigation.",
    target_metric: { name: "policy_blocking_findings", desired_direction: "decrease" },
    guardrails: [{ metric: "unsupported_claim_rate", operator: "==", value: 0 }],
    semantic_triggers: [],
    requested_rollout_percent: 0,
    changes: { module_family: fixes.some(item => item.fix!.kind === "remove_module" || item.fix!.kind === "add_module"), ranking: fixes.some(item => item.fix!.kind === "reorder_modules") },
    does_not_change: { navigation: true, user_job: true, onboarding: true, ...(cause === "policy_delta" ? {} : { source_policy: true }) },
    experience_contract: { ...refreshContract(args.manifest.intent.job, args.manifest), impact_triggers: fixes.some(item => item.fix!.kind === "remove_module" || item.fix!.kind === "add_module") ? ["module_selection_change"] : [] },
  };
  const change: MeshChange = { contract, createdAt: args.now, evaluation: null };
  changeLog().push(change);
  await recordMeshEvent(args.sessionId ?? null, "change_created", { changeId: contract.change_id, cause, findings: fixes.length });
  return change;
}

export function samplesFor(manifests: ReadonlyArray<{ key: string; manifest: ExperienceManifest }>, policyVersion: string): ExperienceSample[] {
  return manifests.map(item => experienceSample(item.manifest, item.key, policyVersion));
}

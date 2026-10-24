import type { ExperienceManifest as ControlPlaneManifest, ExperienceSample, RepresentationMode as ControlPlaneRepresentation } from "@/control-plane/lib/model";
import type { ExperienceManifest, ModuleFamily, RepresentationMode } from "./manifest";

/**
 * Projection of a runtime ExperienceManifest onto the Control Plane's
 * contracts, so the same validators (evaluateManifestAgainstChange,
 * negative obligations) judge what users actually receive.
 */

const REPRESENTATION: Record<RepresentationMode, ControlPlaneRepresentation> = {
  professional_answer: "SHORT_TEXT",
  drug_card: "TABLE",
  drug_comparison: "COMPARISON_MATRIX",
  source_positions: "COMPARISON_MATRIX",
  guideline_delta: "EVIDENCE_STACK",
  evidence_comparison: "COMPARISON_MATRIX",
  event_list: "TIMELINE",
  learning_step: "CHECKLIST",
  source_list: "SOURCE_TRAIL",
  safe_answer: "TEXT",
};

const SECONDARY: Partial<Record<ModuleFamily, ControlPlaneRepresentation>> = {
  evidence: "EVIDENCE_STACK",
  sources: "SOURCE_TRAIL",
  conflict: "COMPARISON_MATRIX",
  recommendation_delta: "EVIDENCE_STACK",
  drug_reference: "TABLE",
  comparison: "COMPARISON_MATRIX",
  positions: "COMPARISON_MATRIX",
  handoff: "ACTION_PANEL",
  next_actions: "ACTION_PANEL",
};

export function toControlPlaneManifest(manifest: ExperienceManifest): ControlPlaneManifest {
  const primary = REPRESENTATION[manifest.representation.mode];
  return {
    request_id: manifest.id,
    primary_job: manifest.intent.job,
    // The capability that produced the result; module families are the representation.
    module_id: manifest.representation.mode === "safe_answer" ? "safe_answer" : "evidence_answer",
    representation: {
      primary,
      secondary: [...new Set(manifest.modules.map(entry => SECONDARY[entry.family]).filter((value): value is ControlPlaneRepresentation => Boolean(value) && value !== primary))],
      text_summary_required: manifest.modules.some(entry => entry.family === "key_takeaway"),
    },
    personalization: { applied: manifest.personalization.applied, confidence: manifest.personalization.applied ? 1 : 0, source: manifest.personalization.source === "preference" ? "preference" : manifest.personalization.source === "session" ? "session" : "default" },
    onboarding: { show: false, reason: null },
    stable_shell_version: manifest.stableShell,
    compiler_warnings: manifest.compiler.warnings,
  };
}

export function experienceSample(manifest: ExperienceManifest, scenario: string, sourcePolicyVersion: string): ExperienceSample {
  const ranking = manifest.modules.flatMap(entry => entry.documentIds);
  return {
    scenario,
    manifest_id: manifest.id,
    primary_job: manifest.intent.job,
    module_families: manifest.modules.map(entry => entry.family),
    representation: manifest.representation.mode,
    stable_shell_version: manifest.stableShell,
    source_policy_version: sourcePolicyVersion,
    onboarding_shown: false,
    ranking: [...new Set(ranking)],
  };
}

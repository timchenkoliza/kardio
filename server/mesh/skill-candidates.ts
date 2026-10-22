import { classifyRisk } from "@/control-plane/lib/risk";
import { decideRelease } from "@/control-plane/lib/decision";
import type { ChangeContract } from "@/control-plane/lib/model";
import { proposeSkillCandidates, type DynamicPlanObservation } from "@/lib/mesh/skill-learning";
import type { SkillCandidate } from "@/lib/mesh/skills/types";
import { changeLog, type MeshChange } from "./changes";
import { meshMemoryEvents, recordMeshEvent } from "./telemetry";

/**
 * SkillCandidate → Control Plane Change. The Change is PROPOSED and its
 * release decision BLOCKs until an editor curates an evaluation set, the
 * differential evaluation passes and a human approves — the Skills library
 * is never changed from here.
 */

function contractFor(candidate: SkillCandidate, now: string): ChangeContract {
  return {
    change_id: `CHG-${now.slice(0, 10)}-${candidate.id}`,
    cause: "experience_delta",
    status: "PROPOSED",
    title: `Skill candidate: ${candidate.observedIntents.jobType}${candidate.observedIntents.nosology ? ` · ${candidate.observedIntents.nosology}` : ""}`,
    problem: { user_segment: "physicians repeating one request shape", job: candidate.observedIntents.jobType, observed_failure: `the same request shape ran a fresh dynamic plan ${candidate.observedIntents.count} times in ${candidate.observedIntents.sessions} sessions`, evidence: [`signature ${candidate.signature}`] },
    hypothesis: candidate.expectedBenefit,
    target_metric: { name: "complete_answer_rate_matched_jobs", desired_direction: "increase" },
    guardrails: [{ name: "unsupported_claims_shown", operator: "=", threshold: 0 }, { name: "lost_modules_vs_generic", operator: "=", threshold: 0 }],
    expected_paths: ["lib/mesh/skills/**", "lib/mesh/flows/**"],
    requested_rollout_percent: 0,
    kill_criteria: ["differential evaluation fails", "no curated evaluation set"],
    changes: { representation: true },
    does_not_change: { navigation: true, onboarding: true, source_policy: true, safety_thresholds: true },
  };
}

export async function recordSkillCandidates(args: { now: Date; sessionId: string | null; observations?: readonly DynamicPlanObservation[] }): Promise<MeshChange[]> {
  const observations = args.observations ?? meshMemoryEvents({ event: "dynamic_plan_used" }).map(event => ({ signature: String(event.payload.signature ?? ""), sessionId: event.sessionId, at: event.createdAt })).filter(item => item.signature);
  const existing = new Set(changeLog().map(change => change.contract.change_id.replace(/^CHG-\d{4}-\d{2}-\d{2}-/u, "")));
  const created: MeshChange[] = [];
  for (const candidate of proposeSkillCandidates(observations, { now: args.now, existing })) {
    const contract = contractFor(candidate, args.now.toISOString());
    const assessment = classifyRisk({ contract, changedFiles: ["lib/mesh/skills/candidate.ts"], candidateSha: "unreleased", baselineSha: "current" });
    // No evaluation has run: the decision is computed by the Control Plane, never assumed.
    const decision = decideRelease({ assessment, gates: [], now: args.now.toISOString() });
    const change: MeshChange = { contract, createdAt: args.now.toISOString(), evaluation: { assessment, obligations: { passed: false, checked: [], violations: [], contradictions: [] }, manifestChecks: [], gates: [], decision: decision.status === "BLOCK" ? decision : { ...decision, status: "BLOCK", reasons: ["no curated evaluation set and no human approval"] } } };
    changeLog().push(change);
    created.push(change);
    await recordMeshEvent(args.sessionId, "skill_candidate_created", { candidateId: candidate.id, signature: candidate.signature, count: candidate.observedIntents.count, sessions: candidate.observedIntents.sessions, changeId: contract.change_id, decision: change.evaluation!.decision.status });
  }
  return created;
}

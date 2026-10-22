import { describe, expect, it } from "vitest";
import { ACTION_CONNECTORS, needsConfirmation, sourceConnector } from "@/lib/mesh/connectors";
import { proposeSkillCandidates } from "@/lib/mesh/skill-learning";
import { SKILL_LIBRARY } from "@/lib/mesh/skills/registry";
import { changeLog } from "@/server/mesh/changes";
import { recordSkillCandidates } from "@/server/mesh/skill-candidates";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";

const NOW = new Date("2026-10-22T10:00:00.000Z");
const SIG = "neurology|guideline_check|neurology/migraine|-|drug|-";
const at = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe("Skill learning: candidate → Change, never a silent library edit", () => {
  it("a request shape repeated by enough sessions becomes one candidate; a lone or vague one does not", () => {
    const repeated = [{ signature: SIG, sessionId: "s1", at: at(1) }, { signature: SIG, sessionId: "s2", at: at(2) }, { signature: SIG, sessionId: "s1", at: at(3) }];
    const [candidate, ...rest] = proposeSkillCandidates(repeated, { now: NOW });
    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ schema: "kardio.skill-candidate/0.1", signature: SIG, status: "candidate", observedIntents: { count: 3, sessions: 2, jobType: "guideline_check", nosology: "neurology/migraine" }, proposedMatchRules: { requires: { drug: true, nosology: true } }, evaluationSet: [] });
    expect(proposeSkillCandidates(repeated.map(item => ({ ...item, sessionId: "s1" })), { now: NOW })).toEqual([]);
    expect(proposeSkillCandidates(repeated.map(item => ({ ...item, at: at(24 * 30) })), { now: NOW })).toEqual([]);
    const vague = "therapy|reference_answer|-|-|-|-";
    expect(proposeSkillCandidates([1, 2, 3].map(index => ({ signature: vague, sessionId: `s${index}`, at: at(index) })), { now: NOW })).toEqual([]);
  });

  it("records a PROPOSED Change whose release decision BLOCKs, once per signature, and leaves the library unchanged", async () => {
    const before = SKILL_LIBRARY.map(skill => `${skill.id}@${skill.version}:${skill.rollout.mode}`);
    const observations = [{ signature: SIG, sessionId: "s1", at: at(1) }, { signature: SIG, sessionId: "s2", at: at(2) }, { signature: SIG, sessionId: "s3", at: at(3) }];
    const created = await recordSkillCandidates({ now: NOW, sessionId: null, observations });
    expect(created).toHaveLength(1);
    expect(created[0].contract.status).toBe("PROPOSED");
    expect(created[0].evaluation!.decision.status).toBe("BLOCK");
    expect(JSON.stringify(created[0].contract)).not.toMatch(/мигрен/iu);
    expect(await recordSkillCandidates({ now: NOW, sessionId: null, observations })).toHaveLength(0);
    expect(changeLog().filter(change => change.contract.change_id.includes("skill-candidate"))).toHaveLength(1);
    expect(SKILL_LIBRARY.map(skill => `${skill.id}@${skill.version}:${skill.rollout.mode}`)).toEqual(before);
  });
});

describe("connectors: sources read, actions need confirmation", () => {
  it("every source connector is read-only; every action connector requires confirmation", () => {
    for (const descriptor of descriptors(createSourceRegistry({ browserDriver: null }))) {
      const connector = sourceConnector(descriptor);
      expect(connector.mutatesExternalState).toBe(false);
      expect(needsConfirmation(connector)).toBe(false);
    }
    for (const connector of ACTION_CONNECTORS) {
      expect(connector.requiresConfirmation).toBe(true);
      expect(needsConfirmation(connector)).toBe(true);
    }
    // No new external action in this phase: exactly the actions the confirmation service prepares.
    expect(ACTION_CONNECTORS.map(connector => connector.action).sort()).toEqual(["calendar_write", "email", "external_link", "publishing", "purchase", "registration"]);
  });

  it("Skills never prefer an action, only evidence capabilities", () => {
    for (const skill of SKILL_LIBRARY) expect(skill.preferredCapabilities).toEqual(["evidence_answer"]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { compileIntent } from "@/lib/mesh/intent";
import { validateManifest } from "@/lib/mesh/policies";
import { applyView } from "@/lib/mesh/refine";
import { workspaceStore } from "@/server/agents/store";
import { createRun, runAgent } from "@/server/agents/supervisor";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { meshMemoryEvents } from "@/server/mesh/telemetry";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { respondToAsk } from "@/server/portal/manager";
import { refineRun } from "@/server/portal/refine";
import { listContent, listSources } from "@/server/repositories/catalog";
import { ensureSession } from "@/server/services/state";
import { fakeAbstracts, fakeDrugLabel, fakePubmed } from "./agent-test-utils";
import { FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW } from "./mesh-test-utils";

/**
 * The Skills & Flows journey over fixtures (no network): a matched Skill runs
 * its Flow, the result becomes context, follow-ups patch the same run, an
 * ambiguous request gets one question, a large comparison its plan.
 */

const SESSION = "c".repeat(64);
const DRUG_EVIDENCE = "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?";
const fakes = { pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]), drugLabel: fakeDrugLabel() };

beforeEach(() => resetBrowserToolState());

async function executed(text: string, specialty: "cardiology" | "pediatrics" = "cardiology", job: "guidelines" | "drug" = "guidelines"): Promise<AgentRun> {
  delete process.env.DATABASE_URL;
  await ensureSession(SESSION);
  const store = workspaceStore();
  const profile = defaultProfile(specialty);
  const run = await createRun(store, SESSION, { agentId: "reference", specialty, profile, trigger: "composer", text, job, context: { entities: [], answered: null, planConfirmed: null } });
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  const outcome = await runAgent({ store, sessionId: SESSION, catalog: { content, sources }, browserDriver: new FixtureDriver(), ...fakes }, { agentId: "reference", specialty, profile, trigger: "composer", text, job, intent: compileIntent(text, specialty), run });
  return outcome.run;
}

describe("Skill fast path end to end", () => {
  it("«…что сейчас известно?» runs cardiology.drug_evidence as the golden path: guideline, instruction, society guideline, research", async () => {
    const run = await executed(DRUG_EVIDENCE);
    expect(run.status).toMatch(/completed|partial/u);
    expect(run.execution).toMatchObject({ class: "skill", skill: { id: "cardiology.drug_evidence", mode: "primary" }, flow: { flowId: "drug_evidence.flow", branches: ["instruction:then"] }, fallback: null, shadow: null });
    const manifest = run.experience!.manifest;
    expect(manifest.intent.job).toBe("guideline_check");
    expect(manifest.modules.map(entry => entry.family)).toEqual(expect.arrayContaining(["key_takeaway", "recommendation_delta", "drug_reference", "evidence"]));
    expect(manifest.execution).toMatchObject({ class: "skill", explanation: "Сверяем инструкцию, рекомендации и свежие исследования" });
    expect(validateManifest(manifest, run.experience!.graph, { descriptors: descriptors(createSourceRegistry({ browserDriver: new FixtureDriver() })) }).passed).toBe(true);
    expect(run.plan[0].detail).toContain("Сверяем инструкцию, рекомендации и свежие исследования");
    // Telemetry: ids and categories only, never the question.
    const events = meshMemoryEvents({ sessionId: SESSION });
    expect(events.some(event => event.event === "intent_skill_matched" && event.payload.skillId === "cardiology.drug_evidence")).toBe(true);
    expect(events.some(event => event.event === "intent_flow_branch_taken" && event.payload.branch === "then")).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/Эмпаглифлозин|что сейчас/iu);
  });

  it("the result becomes context: refinements patch the SAME run, keep module identities, and call a source only when needed", async () => {
    const run = await executed(DRUG_EVIDENCE);
    const before = run.experience!.manifest;
    const deps = { browserDriver: new FixtureDriver(), context: fakes };

    const russian = await refineRun(SESSION, "cardiology", run.id, "Оставь только российские источники", deps);
    expect(russian).toMatchObject({ runId: run.id, applied: true, retrieval: false, delta: { kind: "filter_jurisdiction" } });
    expect(russian!.patch!.modulesAdded).toEqual([]);
    expect(russian!.patch!.parentManifestVersion).toBe(run.progress!.manifestVersion);
    const afterRussian = (await workspaceStore().getRun(SESSION, run.id))!;
    expect(afterRussian.id).toBe(run.id);
    expect(afterRussian.experience!.manifest.view?.jurisdiction).toBe("RU");
    expect(applyView(afterRussian.experience!.graph, afterRussian.experience!.manifest.view).documents.every(document => document.jurisdiction === "RU")).toBe(true);
    // The full graph is kept: the filter withholds, it does not delete.
    expect(afterRussian.experience!.graph.documents.length).toBe(run.experience!.graph.documents.length);
    const preserved = new Set(afterRussian.experience!.manifest.modules.map(entry => entry.id));
    expect(before.modules.filter(entry => preserved.has(entry.id)).length).toBeGreaterThan(0);

    const previous = await refineRun(SESSION, "cardiology", run.id, "Покажи, что изменилось относительно предыдущей версии.", deps);
    expect(previous).toMatchObject({ runId: run.id, applied: true, retrieval: false, delta: { kind: "version_delta" } });
    const afterPrevious = (await workspaceStore().getRun(SESSION, run.id))!;
    // Under «only Russian sources» the international document that names the previous version is hidden — and the result says so.
    const delta = afterPrevious.experience!.manifest.modules.find(entry => entry.family === "recommendation_delta")!;
    expect(delta.props).toMatchObject({ comparison: "current_state", hiddenPreviousVersion: "ESC 2021 и фокусное обновление 2023", hiddenBy: "jurisdiction" });

    const reset = await refineRun(SESSION, "cardiology", run.id, "Покажи всё", deps);
    expect(reset).toMatchObject({ applied: true, delta: { kind: "reset" } });
    const again = await refineRun(SESSION, "cardiology", run.id, "Покажи, что изменилось относительно предыдущей версии.", deps);
    expect(again!.applied).toBe(true);
    const compared = (await workspaceStore().getRun(SESSION, run.id))!;
    expect(compared.experience!.manifest.modules.find(entry => entry.family === "recommendation_delta")!.props).toMatchObject({ comparison: "previous_version", previousVersion: "ESC 2021 и фокусное обновление 2023" });

    const dosing = await refineRun(SESSION, "cardiology", run.id, "Сравни только дозировки", deps);
    expect(dosing).toMatchObject({ applied: true, retrieval: true, delta: { kind: "focus", params: { focus: "dosing" } } });
    const focused = (await workspaceStore().getRun(SESSION, run.id))!;
    const visible = applyView(focused.experience!.graph, focused.experience!.manifest.view);
    const instruction = visible.documents.find(document => document.kind === "drug_instruction")!;
    expect(visible.claims.filter(claim => claim.documentId === instruction.id).every(claim => claim.kind === "dosing")).toBe(true);
    expect(visible.claims.some(claim => claim.documentId === instruction.id && claim.kind === "dosing")).toBe(true);

    expect(focused.patches!.map(patch => patch.reason?.intentDelta?.kind)).toEqual(["filter_jurisdiction", "version_delta", "reset", "version_delta", "focus"]);
    expect(focused.progress!.manifestVersion).toBe(run.progress!.manifestVersion + 5);
    expect(validateManifest(focused.experience!.manifest, visible, { descriptors: descriptors(createSourceRegistry({ browserDriver: new FixtureDriver() })) }).passed).toBe(true);

    // A new drug is a new question, not a refinement.
    expect(await refineRun(SESSION, "cardiology", run.id, "А дапаглифлозин?", deps)).toBeNull();
  });

  it("refuses a refinement this result cannot answer, without touching the run", async () => {
    const run = await executed(DRUG_EVIDENCE);
    const refused = await refineRun(SESSION, "cardiology", run.id, "Раскрой пятнадцатый источник", { browserDriver: new FixtureDriver(), context: fakes });
    // «пятнадцатый» is not an ordinal the classifier knows: a new question, never a guess.
    expect(refused).toBeNull();
    const far = await refineRun(SESSION, "cardiology", run.id, "Раскрой пятый источник", { browserDriver: new FixtureDriver(), context: fakes });
    if (far && !far.applied) expect(far.message).toMatch(/нет источника № 5/u);
  });
});

describe("one clarification, an explicit plan — through the ask contract", () => {
  it("«Подходит ли семаглутид?» returns one question; «Семаглутид — что с ним?» starts a run", async () => {
    delete process.env.DATABASE_URL;
    await ensureSession(SESSION);
    const asked = await respondToAsk(SESSION, "endocrinology", "Подходит ли семаглутид?", { schedule: () => undefined });
    expect(asked.kind).toBe("clarification");
    const direct = await respondToAsk(SESSION, "endocrinology", "Семаглутид — что с ним?", { schedule: () => undefined });
    expect(direct.kind).toBe("run");
    const answered = asked.kind === "clarification" ? await respondToAsk(SESSION, "endocrinology", "Семаглутид: противопоказания и особые указания", { clarification: { id: asked.clarification.id, optionId: "safety" }, schedule: () => undefined }) : null;
    expect(answered?.kind).toBe("run");
    const events = meshMemoryEvents({ sessionId: SESSION });
    expect(events.some(event => event.event === "clarification_shown")).toBe(true);
    expect(events.some(event => event.event === "clarification_resolved" && event.payload.optionId === "safety")).toBe(true);
  });

  it("a three-drug comparison shows the plan first; «Продолжить» starts the run", async () => {
    delete process.env.DATABASE_URL;
    await ensureSession(SESSION);
    const plan = await respondToAsk(SESSION, "cardiology", "Сравни апиксабан, ривароксабан и дабигатран при ФП", { schedule: () => undefined });
    expect(plan.kind).toBe("plan");
    const run = plan.kind === "plan" ? await respondToAsk(SESSION, "cardiology", "Сравни апиксабан, ривароксабан и дабигатран при ФП", { planConfirmed: plan.plan.id, schedule: () => undefined }) : null;
    expect(run?.kind).toBe("run");
  });
});

describe("the non-cardiology Skill stays in its specialty", () => {
  it("pediatrics.drug_reference_children runs in pediatrics with no cardiology evidence", async () => {
    const run = await executed("Эмпаглифлозин у детей", "pediatrics", "drug");
    expect(run.execution?.skill?.id).toBe("pediatrics.drug_reference_children");
    expect(run.execution?.flow?.flowId).toBe("pediatric_drug_reference.flow");
    const graph = run.experience!.graph;
    expect(graph.specialty).toBe("pediatrics");
    expect(graph.sources.map(source => source.id)).not.toContain("esc_guidelines_snapshot");
    expect(graph.documents.some(document => document.kind === "guideline" || document.kind === "society_guideline_summary")).toBe(false);
    expect(JSON.stringify(graph.entities)).not.toMatch(/nosology:cardiology/u);
  });
});

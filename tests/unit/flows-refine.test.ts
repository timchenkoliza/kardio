import { beforeEach, describe, expect, it } from "vitest";
import { compileExperience } from "@/lib/mesh/compiler";
import type { EvidenceGraph } from "@/lib/mesh/evidence";
import { compareShadow, shadowSide } from "@/lib/mesh/execution";
import { evaluateCondition, runFlow } from "@/lib/mesh/flow-runtime";
import { flowById } from "@/lib/mesh/flows/registry";
import { diffManifests, PATCH_SCHEMA } from "@/lib/mesh/patch";
import { validateManifest } from "@/lib/mesh/policies";
import { applyView, buildExperienceContext, classifyDelta, EMPTY_VIEW, resolveDelta, viewDirectives, viewLabel } from "@/lib/mesh/refine";
import { compileWithSkill } from "@/lib/mesh/skill-compile";
import { skillById } from "@/lib/mesh/skills/registry";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { injectedDelayMs } from "@/server/mesh/execute";
import { descriptors } from "@/server/mesh/sources/registry";
import { acceptanceGraph } from "./mesh-test-utils";

beforeEach(() => resetBrowserToolState());

async function golden() {
  const { graph, registry, intent } = await acceptanceGraph();
  const policy = { descriptors: descriptors(registry) };
  const base = { user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy, scenario: intent.context.scenario, resultKeys: {} };
  return { graph, base, policy, intent };
}

describe("flow runtime: the DAG is stable, the evidence path varies", () => {
  it("guideline_change: the society guideline states its previous version → version delta with the changed assertions", async () => {
    const { graph } = await golden();
    const skill = skillById("cardiology.guideline_change")!;
    const run = runFlow(flowById(skill.flowId)!, skill, graph);
    expect(evaluateCondition("previous_version_found", graph)).toBe(true);
    expect(run.trace.branches).toEqual(["official_status:then", "has_previous:then"]);
    expect(run.trace.steps.find(step => step.id === "current_state")?.status).toBe("not_taken");
    expect(run.trace.steps.find(step => step.id === "official_gap")?.status).toBe("not_taken");
    expect(run.directives.moduleProps.recommendation_delta).toMatchObject({ comparison: "previous_version", previousVersion: "ESC 2021 и фокусное обновление 2023" });
    expect((run.directives.moduleProps.recommendation_delta!.changedClaimIds as string[]).length).toBeGreaterThan(0);
  });

  it("guideline_change: no previous version → current state; no Russian guideline → hand-off and an explicit gap", async () => {
    const { graph } = await golden();
    const skill = skillById("cardiology.guideline_change")!;
    const withoutPrevious: EvidenceGraph = { ...graph, documents: graph.documents.map(document => ({ ...document, attributes: { ...document.attributes, previousVersion: null, supersedes: null } })) };
    const current = runFlow(flowById(skill.flowId)!, skill, withoutPrevious);
    expect(current.trace.branches).toContain("has_previous:otherwise");
    expect(current.directives.moduleProps.recommendation_delta).toMatchObject({ comparison: "current_state" });
    const withoutRu: EvidenceGraph = { ...graph, gaps: [], documents: graph.documents.filter(document => !(document.kind === "guideline" && document.jurisdiction === "RU")) };
    const handoff = runFlow(flowById(skill.flowId)!, skill, withoutRu);
    expect(handoff.trace.branches).toContain("official_status:otherwise");
    expect(handoff.directives.gaps.join(" ")).toMatch(/российские клинические рекомендации по теме не найдены — официальный статус проверьте в рубрикаторе/u);
  });

  it("pediatric flow: children information first when the instruction has it; an honest gap when it does not", async () => {
    const { graph } = await golden();
    const skill = skillById("pediatrics.drug_reference_children")!;
    const instruction = graph.documents.find(document => document.kind === "drug_instruction")!;
    const dosing = { id: "claim-children-dosing", documentId: instruction.id, chunkId: null, kind: "dosing" as const, statement: "Детям старше 12 лет — по 10 мг один раз в сутки.", quote: "Детям старше 12 лет — по 10 мг один раз в сутки.", language: "ru" as const, polarity: "neutral" as const, entityIds: [], covers: [], method: "verbatim" as const, confidence: 1, verification: "SUPPORTED" as const, verificationNote: null };
    const withChildren: EvidenceGraph = { ...graph, family: "drug", claims: [...graph.claims, dosing] };
    const found = runFlow(flowById(skill.flowId)!, skill, withChildren);
    expect(found.trace.branches).toEqual(["pediatric_section:then"]);
    expect(found.directives.priorityClaims).toEqual(["claim-children-dosing"]);
    const missing = runFlow(flowById(skill.flowId)!, skill, { ...graph, family: "drug" });
    expect(missing.trace.branches).toEqual(["pediatric_section:otherwise"]);
    expect(missing.directives.gaps[0]).toMatch(/в выдержках инструкции нет отдельных сведений о детях/u);
  });

  it("skill-shaped compile passes every policy gate, records the execution, and falls back to the generic compile on failure", async () => {
    const { graph, base, policy } = await golden();
    const skill = skillById("cardiology.guideline_change")!;
    const shaped = compileWithSkill(base, graph, skill, flowById(skill.flowId));
    expect(shaped.fallback).toBeNull();
    expect(shaped.output.fallback).toBe(false);
    expect(validateManifest(shaped.output.manifest, shaped.graph, policy).passed).toBe(true);
    expect(shaped.output.manifest.execution).toMatchObject({ class: "skill", explanation: "Сравниваем текущую и предыдущую версии рекомендаций", skill: { id: "cardiology.guideline_change" }, flow: { id: "guideline_change.flow", branches: ["official_status:then", "has_previous:then"] } });
    const delta = shaped.output.manifest.modules.find(entry => entry.family === "recommendation_delta")!;
    expect(delta.props.comparison).toBe("previous_version");
    // A broken flow never breaks the answer: the generic compile of the same evidence answers.
    const broken = compileWithSkill(base, graph, skill, { ...flowById(skill.flowId)!, dependencies: [{ from: "compile", to: "resolve_topic" }, { from: "resolve_topic", to: "compile" }] });
    expect(broken.fallback).toMatch(/^skill_error:/u);
    expect(broken.output.fallback).toBe(false);
    expect(broken.output.manifest.execution?.class).toBe("dynamic");
  });

  it("shadow comparison: a Skill that keeps everything and adds a module passes; a lost module fails", async () => {
    const { graph, base } = await golden();
    const generic = compileExperience({ ...base, graph });
    const side = shadowSide(generic.manifest, graph, { durationMs: 100 });
    expect(compareShadow({ skillId: "s", version: "1", flowId: "f", at: "now", generic: side, skill: { ...side, contentModules: [...side.contentModules, "comparison"] } }).verdict).toBe("pass");
    const lost = compareShadow({ skillId: "s", version: "1", flowId: "f", at: "now", generic: side, skill: { ...side, contentModules: side.contentModules.slice(1) } });
    expect(lost.verdict).toBe("fail");
    expect(lost.reasons[0]).toMatch(/^lost_modules:/u);
    expect(compareShadow({ skillId: "s", version: "1", flowId: "f", at: "now", generic: side, skill: { ...side, unsupportedShown: 1 } }).verdict).toBe("fail");
  });
});

describe("result as context: refinement deltas over the open result", () => {
  async function context() {
    const { graph, base } = await golden();
    const output = compileExperience({ ...base, graph });
    const ctx = buildExperienceContext({ id: "run-1", progress: { manifestVersion: 3 } }, { manifest: output.manifest, graph });
    return { graph, base, manifest: output.manifest, ctx };
  }

  it("classifies the five refinements of the brief, and treats a new drug or disease as a new question", async () => {
    const { ctx } = await context();
    const named = { drugs: [], nosology: null };
    expect(classifyDelta("Оставь только российские источники", ctx, named)).toEqual({ kind: "filter_jurisdiction", params: { jurisdiction: "RU" } });
    expect(classifyDelta("Сравни только дозировки", ctx, named)).toEqual({ kind: "focus", params: { focus: "dosing" } });
    expect(classifyDelta("Покажи только изменения после 2024 года", ctx, named)).toEqual({ kind: "filter_since", params: { year: 2025 } });
    expect(classifyDelta("Раскрой второй источник", ctx, named)).toEqual({ kind: "expand", params: { ordinal: 2 } });
    expect(classifyDelta("А что изменилось относительно прошлой версии?", ctx, named)).toEqual({ kind: "version_delta", params: {} });
    expect(classifyDelta("Покажи, что изменилось относительно предыдущей версии.", ctx, named)).toEqual({ kind: "version_delta", params: {} });
    expect(classifyDelta("Покажи данные после 2025 года", ctx, named)).toEqual({ kind: "fresh_since", params: { year: 2026 } });
    expect(classifyDelta("Дапаглифлозин при ХСН", ctx, { drugs: ["dapagliflozin"], nosology: "cardiology/heart_failure" })).toBeNull();
    expect(classifyDelta("Что с мигренью?", ctx, { drugs: [], nosology: "neurology/migraine" })).toBeNull();
    expect(classifyDelta("Расскажи подробнее", ctx, named)).toBeNull();
  });

  it("«только российские» is answered from the graph: international documents withheld, module identities kept", async () => {
    const { graph, base, manifest, ctx } = await context();
    const resolution = resolveDelta({ kind: "filter_jurisdiction", params: { jurisdiction: "RU" } }, ctx, graph);
    expect(resolution.retrieval).toEqual([]);
    expect(resolution.refused).toBeNull();
    const visible = applyView(graph, resolution.view);
    expect(visible.documents.every(document => document.jurisdiction === "RU")).toBe(true);
    expect(visible.id).toBe(graph.id);
    const next = compileExperience({ ...base, graph: visible, ...viewDirectives(visible, manifest, resolution.view), view: resolution.view });
    expect(next.fallback).toBe(false);
    const patch = diffManifests(manifest, next.manifest, { runId: "run-1", manifestVersion: 4, parentManifestVersion: 3, status: "completed", reason: { kind: "refinement", intentDelta: { kind: "filter_jurisdiction", params: { jurisdiction: "RU" } }, affectedEvidence: { requirements: resolution.requirements, documentIds: resolution.documentIds, claimIds: [] }, retrieval: false } });
    expect(patch.schema).toBe(PATCH_SCHEMA);
    expect(patch.parentManifestVersion).toBe(3);
    // The same modules are updated or removed — never rebuilt under new identities.
    expect(patch.modulesAdded).toEqual([]);
    expect(patch.modulesUpdated.length + patch.modulesRemoved.length).toBeGreaterThan(0);
    expect(patch.preservedModules.length + patch.modulesUpdated.length).toBeGreaterThan(0);
    expect(viewLabel(next.manifest.view)).toBe("Показано: только российские источники");
  });

  it("dependency resolution asks a source only for what the graph lacks", async () => {
    const { graph, ctx } = await context();
    const dosing = resolveDelta({ kind: "focus", params: { focus: "dosing" } }, ctx, graph);
    // The golden graph read the instruction for a guideline question: no dosing section yet → one targeted retrieval.
    expect(dosing.retrieval).toEqual([{ requirement: "russian_drug_reference", reason: "в результате нет этого раздела инструкции", focus: "dosing" }]);
    const contraindications = resolveDelta({ kind: "focus", params: { focus: "contraindications" } }, ctx, graph);
    expect(contraindications.retrieval).toEqual([]);
    expect(resolveDelta({ kind: "version_delta", params: {} }, ctx, graph).retrieval).toEqual([]);
    expect(resolveDelta({ kind: "expand", params: { ordinal: 2 } }, ctx, graph).view.expandedDocumentId).toBe(ctx.visibleDocuments[1]);
    expect(resolveDelta({ kind: "expand", params: { ordinal: 40 } }, ctx, graph).refused).toMatch(/нет источника № 40/u);
    const fresh = resolveDelta({ kind: "fresh_since", params: { year: 2026 } }, ctx, graph);
    expect(fresh.retrieval).toEqual([{ requirement: "current_research", reason: "в результате нет публикаций за этот период", since: 2026 }]);
  });

  it("previous-version comparison marks the changed assertions and prioritises them", async () => {
    const { graph, base, manifest, ctx } = await context();
    const resolution = resolveDelta({ kind: "version_delta", params: {} }, ctx, graph);
    const directives = viewDirectives(graph, manifest, resolution.view);
    expect(directives.moduleProps.recommendation_delta).toMatchObject({ comparison: "previous_version", previousVersion: "ESC 2021 и фокусное обновление 2023" });
    const next = compileExperience({ ...base, graph, ...directives, view: resolution.view });
    const takeaway = next.manifest.modules.find(entry => entry.family === "key_takeaway")!;
    expect(takeaway.claimIds[0]).toBe((directives.moduleProps.recommendation_delta!.changedClaimIds as string[])[0]);
    expect(viewLabel(EMPTY_VIEW)).toBeNull();
  });
});

describe("failure injection: Preview of one branch only", () => {
  const ENV = { KARDIO_FAULT_SOURCE_DELAY: "pubmed:30000", KARDIO_FAULT_BRANCH: "feature/intent-skills-flows", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/intent-skills-flows" };
  it("delays only the named source on a Preview of the named branch", () => {
    expect(injectedDelayMs("pubmed", ENV)).toBe(30_000);
    expect(injectedDelayMs("medi", ENV)).toBeNull();
  });
  it("never in production, another branch, locally or without both settings", () => {
    expect(injectedDelayMs("pubmed", { ...ENV, VERCEL_ENV: "production" })).toBeNull();
    expect(injectedDelayMs("pubmed", { ...ENV, VERCEL_GIT_COMMIT_REF: "main" })).toBeNull();
    expect(injectedDelayMs("pubmed", { ...ENV, VERCEL_ENV: undefined })).toBeNull();
    expect(injectedDelayMs("pubmed", { ...ENV, KARDIO_FAULT_BRANCH: undefined })).toBeNull();
    expect(injectedDelayMs("pubmed", {})).toBeNull();
  });
});

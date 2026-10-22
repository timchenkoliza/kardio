import { describe, expect, it } from "vitest";
import { clarificationManifestSchema } from "@/lib/mesh/skills/types";
import { buildSessionContext, emptySessionContext, pinnedSession, resolveReferences, SESSION_CONTEXT_TTL_MS, type SessionRunInput } from "@/lib/mesh/session-context";
import { decideStrategy } from "@/lib/mesh/strategy";

const NOW = new Date("2026-10-22T10:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const run = (id: string, minutes: number, patch: Partial<SessionRunInput> = {}): SessionRunInput => ({ id, startedAt: ago(minutes), status: "completed", family: "guidelines", job: "guideline_check", nosology: "cardiology/heart_failure", subtype: "cardiology/heart_failure/hfpef", drugs: ["empagliflozin"], ...patch });

describe("clarification: only when the answer changes what is executed", () => {
  it("«Подходит ли семаглутид?» → one compact question with five facets and free text", () => {
    const strategy = decideStrategy({ text: "Подходит ли семаглутид?", specialty: "endocrinology" });
    expect(strategy.executionClass).toBe("clarify");
    const manifest = clarificationManifestSchema.parse(strategy.clarification);
    expect(manifest.options.map(option => option.label)).toEqual(["Показания", "Безопасность", "Дозирование", "Сравнить препараты", "Новые данные"]);
    expect(manifest.allowFreeText).toBe(true);
    expect(manifest.reason).toBe("facet_changes_execution");
    // The original intent is preserved for the answer.
    expect(manifest.original).toEqual({ text: "Подходит ли семаглутид?", specialty: "endocrinology" });
    // Never onboarding, never agents or sources.
    expect(JSON.stringify(manifest)).not.toMatch(/агент|источник|pubmed|medi|skill/iu);
    expect(manifest.options.find(option => option.id === "compare")?.effect.edit).toBe(true);
  });

  it("«Семаглутид — что с ним?» runs without interruption", () => {
    expect(decideStrategy({ text: "Семаглутид — что с ним?", specialty: "endocrinology" }).clarification).toBeNull();
  });

  it("at most one turn: an answered request (option or free text) is never asked again", () => {
    const first = decideStrategy({ text: "Подходит ли семаглутид?", specialty: "endocrinology" });
    const again = decideStrategy({ text: "Подходит ли семаглутид?", specialty: "endocrinology", answered: { id: first.clarification!.id, optionId: null } });
    expect(again.executionClass).not.toBe("clarify");
    const option = first.clarification!.options.find(item => item.id === "safety")!;
    const chosen = decideStrategy({ text: option.effect.completeText!, specialty: "endocrinology", answered: { id: first.clarification!.id, optionId: "safety" } });
    expect(chosen.executionClass).not.toBe("clarify");
    expect(chosen.intent.entities.drugs.map(drug => drug.inn)).toEqual(["semaglutide"]);
  });

  it("a topic-less «what changed» asks for the topic from the specialty's own domain", () => {
    const strategy = decideStrategy({ text: "Сравни текущие рекомендации с предыдущими", specialty: "cardiology" });
    expect(strategy.executionClass).toBe("clarify");
    expect(strategy.clarification!.options.map(option => option.label)).toContain("Хроническая сердечная недостаточность");
    const picked = strategy.clarification!.options[0].effect.completeText!;
    const next = decideStrategy({ text: picked, specialty: "cardiology", answered: { id: strategy.clarification!.id, optionId: strategy.clarification!.options[0].id } });
    expect(next.skill?.id).toBe("cardiology.guideline_change");
  });
});

describe("SessionContext: bounded, decaying, ids only", () => {
  it("keeps recent completed runs within the TTL, newest first, with decaying confidence", () => {
    const context = buildSessionContext([run("r1", 5), run("r2", 60, { drugs: ["semaglutide"], nosology: null, subtype: null, family: "drug", job: "drug_reference" }), run("old", SESSION_CONTEXT_TTL_MS / 60_000 + 10), run("failed", 1, { status: "failed" })], { now: NOW });
    expect(context.recent.map(item => item.runId)).toEqual(["r1", "r2"]);
    const empagliflozin = context.activeEntities.find(entity => entity.id === "drug:empagliflozin")!;
    const semaglutide = context.activeEntities.find(entity => entity.id === "drug:semaglutide")!;
    expect(empagliflozin.confidence).toBeGreaterThan(semaglutide.confidence);
    expect(JSON.stringify(context)).not.toMatch(/что сейчас|рекомендац/iu);
    expect(context.ttlMs).toBe(SESSION_CONTEXT_TTL_MS);
  });

  it("«этот препарат» resolves to the clearly most recent drug, and asks when two are equally recent", () => {
    const one = buildSessionContext([run("r1", 2)], { now: NOW });
    const resolved = resolveReferences("Почему сейчас по-разному относятся к этому препарату?", one, { drugs: 0, nosology: false });
    expect(resolved.resolved.map(entity => entity.id)).toEqual(["drug:empagliflozin"]);
    const strategy = decideStrategy({ text: "Почему сейчас по-разному относятся к этому препарату?", specialty: "cardiology", session: one });
    expect(strategy.executionClass).not.toBe("clarify");
    expect(strategy.resolution).toEqual({ entities: ["drug:empagliflozin"], from: "session" });
    expect(strategy.intent.entities.drugs.map(drug => drug.inn)).toEqual(["empagliflozin"]);

    const two = buildSessionContext([run("r1", 2), run("r2", 3, { drugs: ["dapagliflozin"] })], { now: NOW });
    const ambiguous = decideStrategy({ text: "Почему сейчас по-разному относятся к этому препарату?", specialty: "cardiology", session: two });
    expect(ambiguous.executionClass).toBe("clarify");
    expect(ambiguous.clarification!.options.map(option => option.label)).toEqual(["Эмпаглифлозин", "Дапаглифлозин"]);

    const none = decideStrategy({ text: "Почему сейчас по-разному относятся к этому препарату?", specialty: "cardiology", session: emptySessionContext(NOW) });
    expect(none.clarification?.question).toBe("О каком препарате речь?");
  });

  it("a missing topic is taken from the session before anyone is asked", () => {
    const session = buildSessionContext([run("r1", 2)], { now: NOW });
    const strategy = decideStrategy({ text: "Что изменилось в рекомендациях?", specialty: "cardiology", session });
    expect(strategy.executionClass).toBe("skill");
    expect(strategy.skill?.id).toBe("cardiology.guideline_change");
    expect(strategy.resolution?.entities).toContain("nosology:cardiology/heart_failure");
  });

  it("execution re-decides from the pinned entities exactly what creation decided", () => {
    const session = buildSessionContext([run("r1", 2)], { now: NOW });
    const created = decideStrategy({ text: "Почему сейчас по-разному относятся к этому препарату?", specialty: "cardiology", session });
    const executed = decideStrategy({ text: "Почему сейчас по-разному относятся к этому препарату?", specialty: "cardiology", session: pinnedSession(created.resolution!.entities, NOW), answered: { id: "execution", optionId: null } });
    expect(executed.effectiveText).toBe(created.effectiveText);
    expect(executed.intent.id).toBe(created.intent.id);
  });
});

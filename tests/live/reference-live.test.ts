import { describe, expect, it } from "vitest";
import { defaultProfile, effectivePreference } from "@/lib/agents/profile";
import type { SpecialtyId } from "@/lib/domain/types";
import { compileIntent } from "@/lib/mesh/intent";
import type { PortalJob } from "@/lib/portal/jobs";
import { lookupDrugLabelLive } from "@/server/agents/adapters/openfda";
import { searchPubmedLive } from "@/server/agents/adapters/pubmed";
import { fetchPubmedAbstracts } from "@/server/agents/adapters/pubmed-abstracts";
import { evidenceAnswer } from "@/server/mesh/executor";
import { listContent, listSources } from "@/server/repositories/catalog";

/**
 * Live-source smoke: the evidence_answer capability against real PubMed,
 * openFDA and MEDI (real browser when one can start, HTTP otherwise).
 * Skipped unless LIVE_SOURCES=1 (CI has no guaranteed egress).
 * Run: LIVE_SOURCES=1 npx vitest run tests/live
 */
const live = process.env.LIVE_SOURCES === "1";

async function run(specialty: SpecialtyId, text: string, job: PortalJob) {
  const profile = defaultProfile(specialty);
  const now = new Date();
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  const out = await evidenceAnswer({ agentId: "reference", specialty, now, nowIso: now.toISOString(), profile, preference: effectivePreference(profile, "reference"), lastSeenAt: null, catalog: { content, sources }, materials: [], pubmed: query => searchPubmedLive(query), abstracts: pmids => fetchPubmedAbstracts(pmids), drugLabel: name => lookupDrugLabelLive(name), inputText: text, job, history: [], intent: compileIntent(text, specialty, { job: null }), sessionId: "live" });
  if (process.env.LIVE_VERBOSE === "1") {
    console.log(`\n=== ${specialty} · ${job} · «${text}»`);
    for (const step of out.plan) console.log(`  [${step.status}] ${step.label} — ${step.detail ?? ""}`);
    for (const draft of out.drafts) console.log(`  * ${draft.kind} | ${draft.title.slice(0, 80)} | ${draft.evidence.map(item => item.verificationStatus).join(",")} | ${(draft.evidence[0]?.claim ?? "").slice(0, 160)}`);
    console.log(out.experience?.manifest.modules.map(entry => entry.family).join(" → "));
    console.log(out.synthesis);
  }
  return out;
}

describe.skipIf(!live)("evidence_answer against live sources", () => {
  it("answers a pediatric question with quoted review conclusions", async () => {
    const out = await run("pediatrics", "длительность антибиотикотерапии при остром среднем отите у детей", "answer");
    const answers = out.drafts.filter(draft => draft.kind === "reference_answer");
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      // Journals approved by physicians are SUPPORTED; others stay PARTIALLY_SUPPORTED by source policy.
      expect(answer.evidence[0].verificationStatus).toBe(answer.attributes.approvedJournal ? "SUPPORTED" : "PARTIALLY_SUPPORTED");
      expect(answer.source.sourceUrl).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    }
    expect(answers.some(answer => /otitis/i.test(answer.title))).toBe(true);
  }, 90_000);

  it("returns the Russian instruction from MEDI for a drug, with a fallback to FDA only if MEDI is empty", async () => {
    const out = await run("endocrinology", "дапаглифлозин противопоказания", "drug");
    const instruction = out.drafts.find(draft => draft.category === "drug_instruction");
    const fda = out.drafts.find(draft => draft.category === "drug_label");
    expect(instruction ?? fda).toBeTruthy();
    if (instruction) {
      expect(instruction.source.sourceUrl).toMatch(/^https:\/\/medi\.ru\/instrukciya\//u);
      expect(instruction.evidence.length).toBeGreaterThan(1);
      expect(fda).toBeUndefined();
    }
  }, 90_000);

  it("answers a neurology question", async () => {
    const out = await run("neurology", "профилактика мигрени у взрослых", "answer");
    expect(out.drafts.filter(draft => draft.kind === "reference_answer").length).toBeGreaterThan(0);
  }, 90_000);

  it("acceptance: empagliflozin in HFpEF — Russian guideline, instruction, society and research, with currentness and conflict preserved", async () => {
    const out = await run("cardiology", "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?", "guidelines");
    const experience = out.experience!;
    expect(experience.manifest.intent).toMatchObject({ job: "guideline_check", nosology: "cardiology/heart_failure", subtype: "cardiology/heart_failure/hfpef" });
    const sourceOutcome = Object.fromEntries(experience.graph.sources.map(source => [source.id, source.outcome]));
    expect(sourceOutcome.medi).toBe("ok");
    expect(sourceOutcome.minzdrav_rubricator).toBe("handoff");
    const documents = experience.graph.documents.map(document => document.kind);
    expect(documents).toEqual(expect.arrayContaining(["guideline", "drug_instruction", "society_guideline_summary"]));
    const families = experience.manifest.modules.map(entry => entry.family);
    expect(families[0]).toBe("key_takeaway");
    expect(families).toEqual(expect.arrayContaining(["recommendation_delta", "drug_reference", "sources", "handoff"]));
    const guideline = experience.graph.documents.find(document => document.kind === "guideline" && document.sourceId === "medi");
    if (guideline && experience.graph.freshness.find(item => item.documentId === guideline.id)?.state === "revision_overdue") {
      expect(experience.manifest.modules.some(entry => entry.claimIds.some(id => experience.graph.claims.find(claim => claim.id === id)?.kind === "currentness"))).toBe(true);
    }
    if (experience.graph.conflicts.length) expect(families).toContain("conflict");
  }, 120_000);
});

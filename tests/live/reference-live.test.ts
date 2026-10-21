import { describe, expect, it } from "vitest";
import { defaultProfile, effectivePreference } from "@/lib/agents/profile";
import type { SpecialtyId } from "@/lib/domain/types";
import { lookupDrugLabelLive } from "@/server/agents/adapters/openfda";
import { searchPubmedLive } from "@/server/agents/adapters/pubmed";
import { fetchPubmedAbstracts } from "@/server/agents/adapters/pubmed-abstracts";
import { reference } from "@/server/agents/executor-reference";
import { listContent, listSources } from "@/server/repositories/catalog";

/**
 * Live-source smoke: exercises the reference capability against real PubMed
 * and openFDA. Skipped unless LIVE_SOURCES=1 (CI has no guaranteed egress).
 * Run: LIVE_SOURCES=1 npx vitest run tests/live
 */
const live = process.env.LIVE_SOURCES === "1";

async function run(specialty: SpecialtyId, text: string, job: "answer" | "drug") {
  const profile = defaultProfile(specialty);
  const now = new Date();
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  const out = await reference({ agentId: "reference", specialty, now, nowIso: now.toISOString(), profile, preference: effectivePreference(profile, "reference"), lastSeenAt: null, catalog: { content, sources }, materials: [], pubmed: query => searchPubmedLive(query), abstracts: pmids => fetchPubmedAbstracts(pmids), drugLabel: name => lookupDrugLabelLive(name), inputText: text, job, history: [] });
  if (process.env.LIVE_VERBOSE === "1") {
    console.log(`\n=== ${specialty} · ${job} · «${text}»`);
    for (const step of out.plan) console.log(`  [${step.status}] ${step.label} — ${step.detail ?? ""}`);
    for (const draft of out.drafts) console.log(`  * ${draft.kind} | ${draft.title.slice(0, 80)} | ${draft.evidence.map(item => item.verificationStatus).join(",")} | ${(draft.evidence[0]?.claim ?? "").slice(0, 160)}`);
    console.log(out.synthesis);
  }
  return out;
}

describe.skipIf(!live)("reference capability against live sources", () => {
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
  }, 60_000);

  it("returns FDA label sections for a drug", async () => {
    const out = await run("endocrinology", "дапаглифлозин противопоказания", "drug");
    const label = out.drafts.find(draft => draft.kind === "drug_label");
    expect(label).toBeTruthy();
    expect(label?.source.sourceUrl).toContain("dailymed.nlm.nih.gov");
    expect(label?.evidence.length).toBeGreaterThan(1);
  }, 60_000);

  it("answers a neurology question", async () => {
    const out = await run("neurology", "профилактика мигрени у взрослых", "answer");
    expect(out.drafts.filter(draft => draft.kind === "reference_answer").length).toBeGreaterThan(0);
  }, 60_000);
});

import { describe, expect, it } from "vitest";
import type { AgentResult } from "@/lib/agents/types";
import { applyVerdict, normalizeFeedback, preferenceFor, signalsOf } from "@/lib/feed/feedback";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";

/**
 * D1 «интересно / не то» (docs/CAPABILITY_COVERAGE_MATRIX.md, context.topic_research_alerts):
 * a verdict is stored as the material's signals, reorders later selections,
 * and «не то» hides the card; nothing of the material's text is stored.
 */

const SESSION = "5".repeat(64);
const AT = "2026-10-24T10:00:00.000Z";

function publication(id: string, journal: string, studyType: string): AgentResult {
  const provenance = { connectorId: "pubmed", source: journal, sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, publisher: null, retrievedAt: AT, publishedAt: "2026-10-01", version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "runtime_api" as const };
  return { id: `res-${id}-${crypto.randomUUID()}`, key: `update:${id}`, agentId: "whats_new", specialty: "cardiology", runId: "run-x", kind: "update", category: "publication", title: `Title ${id}`, summary: "s", reasonShown: ["Новая публикация по вашим темам"], createdAt: AT, observedAt: "2026-10-01", evidence: [], source: provenance, actions: [], attributes: { journal, studyType, pmid: id }, partner: null, dismissed: false, savedMaterialId: null, rank: 1 };
}

describe("feed feedback", () => {
  it("signals are the journal, the kind of study and the kind of material — never the text", () => {
    expect(signalsOf(publication("1", "Eur Heart J", "РКИ"))).toEqual(["kind:update/publication", "journal:eur heart j", "study:рки"]);
  });

  it("«интересно» lifts similar materials and explains why; «не то» lowers them; weights are bounded", () => {
    let feedback = { signals: {} as Record<string, number> };
    feedback = applyVerdict(feedback, signalsOf(publication("1", "Eur Heart J", "РКИ")), "interesting");
    const similar = preferenceFor(feedback, publication("2", "Eur Heart J", "Метаанализ"));
    expect(similar.score).toBeGreaterThan(0);
    expect(similar.because).toMatch(/интересно/u);
    feedback = applyVerdict(feedback, signalsOf(publication("3", "Lancet", "Обзор")), "not_relevant");
    expect(preferenceFor(feedback, publication("4", "Lancet", "Обзор")).score).toBeLessThan(0);
    for (let index = 0; index < 20; index += 1) feedback = applyVerdict(feedback, ["journal:lancet"], "not_relevant");
    expect(feedback.signals["journal:lancet"]).toBe(-5);
    expect(normalizeFeedback({ signals: { "journal:x": 99, "free text": 1, "kind:y": 0 } })).toEqual({ signals: { "journal:x": 5 } });
  });

  it("the command stores the verdict in the owner's profile and «не то» hides the card", async () => {
    delete process.env.DATABASE_URL;
    const result = publication("9", "Circulation", "РКИ");
    await workspaceStore().upsertResults(SESSION, [result]);
    await executeAgentCommand(SESSION, { action: "feedResult", specialty: "cardiology", resultId: result.id, verdict: "not_relevant" });
    expect((await workspaceStore().getResult(SESSION, result.id))?.dismissed).toBe(true);
    const profile = (await workspaceStore().getProfile(SESSION, "cardiology"))!;
    expect(profile.feedback.signals["journal:circulation"]).toBe(-1);
    expect(JSON.stringify(profile.feedback)).not.toContain("Title 9");
    await expect(executeAgentCommand("4".repeat(64), { action: "feedResult", specialty: "cardiology", resultId: result.id, verdict: "interesting" })).rejects.toMatchObject({ status: 404 });
  });
});

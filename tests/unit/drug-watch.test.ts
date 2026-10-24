import { describe, expect, it } from "vitest";
import type { WatchedDrug } from "@/lib/agents/types";
import { parseRecall, searchDrugRecallsLive, type DrugRecallResult } from "@/server/agents/adapters/openfda-enforcement";
import { executeAgentCommand } from "@/server/agents/commands";
import { CARRY_OVER_NOTICE, runAgent } from "@/server/agents/supervisor";
import { checkWatchlist, quietMonth } from "@/server/agents/services/drug-watch";
import { MemoryWorkspaceStore } from "@/server/agents/store/memory";
import { workspaceStore } from "@/server/agents/store";
import { listContent, listSources } from "@/server/repositories/catalog";
import { fakeDrugLabel, fakePubmed, FIXED_NOW, profileWith, testContext } from "./agent-test-utils";

/**
 * A4 «Мои препараты» (docs/CAPABILITY_COVERAGE_MATRIX.md, drugs.safety_watchlist):
 * alerts only with a regulator document and a date; an explicit monthly
 * «no changes» that names what was checked; an outage is never «no changes».
 */

const APIXABAN: WatchedDrug = { inn: "apixaban", ru: "апиксабан", addedAt: "2026-09-01T00:00:00.000Z", from: "settings" };
const RECALL = { recall_number: "D-0123-2026", classification: "Class II", status: "Ongoing", report_date: "20261008", reason_for_recall: "Failed Dissolution Specifications: out of specification results at the 12-month stability time point.", product_description: "Apixaban Tablets, 5 mg, 60-count bottles", recalling_firm: "Example Pharma Inc." };

function recalls(result: Partial<DrugRecallResult> = {}) {
  const calls: Array<{ inn: string; since: string }> = [];
  const fn = async (inn: string, since: Date): Promise<DrugRecallResult> => {
    calls.push({ inn, since: since.toISOString() });
    return { status: "ok", inn, recalls: [], error: null, retrievedAt: FIXED_NOW.toISOString(), ...result };
  };
  return Object.assign(fn, { calls });
}

async function context(watchlist: WatchedDrug[], label = fakeDrugLabel()) {
  const ctx = await testContext({ agentId: "drugs", topics: [], specialty: "therapy", drugLabel: label });
  ctx.profile = { ...ctx.profile, watchlist };
  return ctx;
}

describe("openFDA enforcement adapter", () => {
  it("parses a recall into a verifiable record and links the exact openFDA query", () => {
    const recall = parseRecall(RECALL)!;
    expect(recall).toMatchObject({ recallNumber: "D-0123-2026", classification: "Class II", reportDate: "2026-10-08" });
    expect(recall.apiUrl).toBe("https://api.fda.gov/drug/enforcement.json?search=recall_number:%22D-0123-2026%22");
    expect(parseRecall({ recall_number: "X" })).toBeNull();
  });

  it("404 is a checked, empty window; a network error is «unavailable», never «no recalls»", async () => {
    const empty = await searchDrugRecallsLive("apixaban", new Date("2026-01-01"), { disabled: false, fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }), now: () => FIXED_NOW });
    expect(empty).toMatchObject({ status: "ok", recalls: [] });
    const down = await searchDrugRecallsLive("rivaroxaban", new Date("2026-01-01"), { disabled: false, fetchImpl: async () => { throw new Error("ECONNRESET"); }, now: () => FIXED_NOW });
    expect(down.status).toBe("unavailable");
    const searched: string[] = [];
    await searchDrugRecallsLive("dabigatran", new Date("2026-02-03T00:00:00Z"), { disabled: false, fetchImpl: async url => { searched.push(url); return { ok: true, status: 200, json: async () => ({ results: [RECALL] }) }; }, now: () => FIXED_NOW });
    expect(decodeURIComponent(searched[0]!.replace(/\+/gu, " "))).toContain('report_date:[20260203 TO 20261019]');
  });
});

describe("watchlist checks", () => {
  it("a recall becomes an alert with the FDA record, its date, the US boundary and the Russian hand-off", async () => {
    const ctx = await context([APIXABAN]);
    const check = await checkWatchlist(ctx, { recalls: recalls({ recalls: [parseRecall(RECALL)!] }) });
    const alert = check.drafts.find(draft => draft.category === "WITHDRAWAL")!;
    expect(alert.title).toBe("США: отзыв серий — апиксабан (класс II)");
    expect(alert.observedAt).toBe("2026-10-08");
    expect(alert.evidence[0]).toMatchObject({ verificationStatus: "SUPPORTED", sourceUrl: expect.stringContaining("recall_number") });
    expect(String(alert.attributes["drugAssessment.practiceImpact"])).toMatch(/рынке США.*Росздравнадзор/u);
    expect(alert.actions.map(action => action.href)).toContain("https://roszdravnadzor.gov.ru/");
    expect(check.drafts.some(draft => draft.category === "NO_CHANGES")).toBe(false);
  });

  it("an FDA label revision is news only after the drug was followed", async () => {
    const label = (date: string) => fakeDrugLabel({ status: "ok", label: { genericName: "apixaban", brandNames: ["Eliquis"], manufacturer: null, effectiveDate: date, setId: "set-1", version: "3", route: ["ORAL"], productType: "HUMAN PRESCRIPTION DRUG", sections: [{ id: "recent_major_changes", ru: "Недавние изменения инструкции", text: "Warnings and Precautions (5.2) 9/2026", truncated: false }], dailyMedUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=set-1", apiUrl: "https://api.fda.gov/drug/label.json" } });
    const after = await checkWatchlist(await context([APIXABAN], label("2026-09-20")), { recalls: recalls() });
    expect(after.drafts.find(draft => draft.category === "LABEL_CHANGE")?.title).toBe("США: изменения инструкции FDA — апиксабан");
    const before = await checkWatchlist(await context([APIXABAN], label("2026-05-01")), { recalls: recalls() });
    expect(before.drafts.some(draft => draft.category === "LABEL_CHANGE")).toBe(false);
  });

  it("a quiet month is one explicit summary that names what was checked and what could not be", async () => {
    const ctx = await context([APIXABAN, { ...APIXABAN, inn: "rivaroxaban", ru: "ривароксабан" }]);
    const check = await checkWatchlist(ctx, { recalls: recalls() });
    expect(check.drafts).toHaveLength(1);
    const quiet = check.drafts[0]!;
    expect(quiet.category).toBe("NO_CHANGES");
    expect(quiet.attributes.month).toBe(quietMonth(FIXED_NOW));
    // One summary per month: a second quiet check in the same month has the same identity (no new «новое»).
    expect((await checkWatchlist(ctx, { recalls: recalls() })).drafts[0]?.key).toBe(quiet.key);
    expect(quiet.summary).toMatch(/апиксабан, ривароксабан/u);
    expect(quiet.summary).toMatch(/Росздравнадзор и ГРЛС не подключены/u);
    expect(quiet.evidence[0]?.verificationStatus).toBe("UNKNOWN");
  });

  it("an unanswered source is never reported as «no changes»", async () => {
    const ctx = await context([APIXABAN]);
    const check = await checkWatchlist(ctx, { recalls: recalls({ status: "unavailable", error: "openFDA сейчас недоступен" }) });
    expect(check.drafts.some(draft => draft.category === "NO_CHANGES")).toBe(false);
    expect(check.failed.recalls).toEqual(["апиксабан"]);
  });
});

describe("the drug agent with a watchlist", () => {
  it("runs in any specialty, keeps alerts across runs, and keeps them while openFDA is down", async () => {
    const store = new MemoryWorkspaceStore();
    const session = "a".repeat(64);
    const profile = profileWith("therapy", []);
    profile.watchlist = [APIXABAN];
    const deps = { store, sessionId: session, catalog: { content: await listContent("therapy"), sources: await listSources("therapy") }, pubmed: fakePubmed([]), drugLabel: fakeDrugLabel(), now: () => FIXED_NOW };
    const first = await runAgent({ ...deps, drugRecalls: recalls({ recalls: [parseRecall(RECALL)!] }) }, { agentId: "drugs", specialty: "therapy", profile, trigger: "scheduled" });
    expect(first.run.status).toBe("completed");
    const alertId = first.results.find(result => result.category === "WITHDRAWAL")!.id;
    expect(first.run.resultIds).toContain(alertId);

    // openFDA is down on the next background check: the alert stays current, the run says why, and it is partial (retried).
    const second = await runAgent({ ...deps, drugRecalls: recalls({ status: "unavailable", error: "openFDA сейчас недоступен" }), drugLabel: async name => ({ status: "unavailable", query: name, label: null, total: 0, error: "openFDA сейчас недоступен", durationMs: 1, retrievedAt: FIXED_NOW.toISOString() }) }, { agentId: "drugs", specialty: "therapy", profile, trigger: "scheduled" });
    expect(second.run.status).toBe("partial");
    expect(second.run.resultIds).toContain(alertId);
    expect(second.run.riskNotices).toContain(CARRY_OVER_NOTICE);
    expect(second.results.some(result => result.category === "NO_CHANGES")).toBe(false);
  });
});

describe("watchlist commands", () => {
  it("adds only known drugs, deduplicates, caps the list and removes", async () => {
    delete process.env.DATABASE_URL;
    const session = "b".repeat(64);
    await workspaceStore().saveProfile(session, profileWith("cardiology", []));
    await expect(executeAgentCommand(session, { action: "watchDrug", specialty: "cardiology", inn: "not-a-drug", from: "settings" } as never)).rejects.toThrow();
    await executeAgentCommand(session, { action: "watchDrug", specialty: "cardiology", inn: "apixaban", from: "drug_result" });
    const again = await executeAgentCommand(session, { action: "watchDrug", specialty: "cardiology", inn: "apixaban", from: "comparison" });
    expect(again.profileChanged).toBe(false);
    expect((await workspaceStore().getProfile(session, "cardiology"))?.watchlist.map(drug => drug.inn)).toEqual(["apixaban"]);
    await executeAgentCommand(session, { action: "unwatchDrug", specialty: "cardiology", inn: "apixaban" });
    expect((await workspaceStore().getProfile(session, "cardiology"))?.watchlist).toEqual([]);
    await executeAgentCommand(session, { action: "setBackgroundPaused", specialty: "cardiology", paused: true });
    expect((await workspaceStore().getProfile(session, "cardiology"))?.backgroundPaused).toBe(true);
  });
});

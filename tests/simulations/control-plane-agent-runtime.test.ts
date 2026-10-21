import { describe, expect, it } from "vitest";
import { EXECUTORS } from "@/server/agents/executors";
import { MemoryWorkspaceStore, resetMemorySession } from "@/server/agents/store/memory";
import { fakePubmed, profileWith, testContext } from "@/tests/unit/agent-test-utils";

function pubmedOutputs<T extends { toolsUsed: Array<{ tool: string; status: string; note: string | null }> }>(out: T) {
  return out.toolsUsed.filter(use => use.tool === "searchPubmed");
}

describe("Simulation Director — real Kardio runtime", () => {
  it("FAIL-PUBMED-DOWN: research degrades explicitly and never fabricates PubMed findings", async () => {
    const ctx = await testContext({
      agentId: "research",
      specialty: "cardiology",
      topics: ["af"],
      text: "atrial fibrillation anticoagulation evidence",
      pubmed: fakePubmed([], "unavailable"),
    });
    ctx.catalog = { content: [], sources: [] };

    const out = await EXECUTORS.research(ctx);
    const calls = pubmedOutputs(out);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(use => use.status === "unavailable")).toBe(true);
    expect(out.plan.some(step => step.tool === "searchPubmed" && step.status === "skipped")).toBe(true);
    expect(out.drafts.some(draft => draft.source.connectorId === "pubmed")).toBe(false);
  });

  it("FAIL-PUBMED-FAILED: connector failure is visible and does not become a false successful source", async () => {
    const ctx = await testContext({
      agentId: "research",
      specialty: "cardiology",
      topics: ["af"],
      text: "atrial fibrillation anticoagulation evidence",
      pubmed: fakePubmed([], "failed"),
    });
    ctx.catalog = { content: [], sources: [] };

    const out = await EXECUTORS.research(ctx);
    const calls = pubmedOutputs(out);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(use => use.status === "failed")).toBe(true);
    expect(out.plan.some(step => step.tool === "searchPubmed" && step.status === "failed")).toBe(true);
    expect(out.drafts.some(draft => draft.source.connectorId === "pubmed")).toBe(false);
  });

  it("STATE-PROFILE-001: isolated simulation state is deterministic and resettable", async () => {
    const store = new MemoryWorkspaceStore();
    const session = "simulation-session-profile";
    resetMemorySession(session);

    const profile = profileWith("cardiology", ["af"]);
    await store.saveProfile(session, profile);
    const first = await store.getProfile(session, "cardiology");
    expect(first?.interests.topics).toEqual(["af"]);

    first!.interests.topics.push("hf");
    const reread = await store.getProfile(session, "cardiology");
    expect(reread?.interests.topics).toEqual(["af"]);

    resetMemorySession(session);
    expect(await store.getProfile(session, "cardiology")).toBeNull();
  });

  it("STATE-UPSERT-001: repeated result upsert by stable key does not leave duplicates", async () => {
    const store = new MemoryWorkspaceStore();
    const session = "simulation-session-results";
    resetMemorySession(session);

    const base = {
      key: "research:stable-result",
      runId: "run-1",
      agentId: "research" as const,
      specialty: "cardiology" as const,
      kind: "research_finding" as const,
      category: "evidence",
      title: "Finding",
      summary: "Summary",
      reasonShown: ["test"],
      observedAt: "2026-10-21",
      evidence: [],
      source: {
        connectorId: "catalog",
        source: "Test",
        sourceUrl: null,
        publisher: null,
        retrievedAt: "2026-10-21T00:00:00.000Z",
        publishedAt: null,
        version: null,
        ownership: "PUBLIC_SOURCE" as const,
        dataOrigin: "catalog_snapshot" as const,
      },
      actions: [],
      attributes: {},
      partner: null,
      rank: 1,
      createdAt: "2026-10-21T00:00:00.000Z",
      dismissed: false,
      savedMaterialId: null,
    };

    await store.upsertResults(session, [{ ...base, id: "result-1" }]);
    await store.upsertResults(session, [{ ...base, id: "result-2", runId: "run-2" }]);

    const results = await store.listResults(session, "cardiology", "research");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("result-2");
    resetMemorySession(session);
  });
});

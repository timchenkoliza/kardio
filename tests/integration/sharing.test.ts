import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import type { AgentResult } from "@/lib/agents/types";
import { buildSharedSnapshot, newShareToken } from "@/lib/sharing/snapshot";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { ensureSession } from "@/server/services/state";
import { shareState, shareStore } from "@/server/sharing/store";

/**
 * Share links in PostgreSQL: a link must open on any instance and after a
 * restart; only the owner session lists or revokes it; opens are counted.
 */

const AT = new Date().toISOString();

function result(): AgentResult {
  const provenance = { connectorId: "pubmed", source: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/42/", publisher: "NCBI", retrievedAt: AT, publishedAt: "2026-10-01", version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "runtime_api" as const };
  return {
    id: `res-${crypto.randomUUID()}`, key: `share-${crypto.randomUUID()}`, agentId: "whats_new", specialty: "cardiology", runId: `run-${crypto.randomUUID()}`, kind: "research_finding", category: null,
    title: "Финеренон при ХСН с сохранённой ФВ", summary: "Снижение частоты госпитализаций по поводу СН.", reasonShown: [], createdAt: AT, observedAt: "2026-10-01",
    evidence: [{ id: "ev", claim: "Finerenone reduced worsening heart failure events.", sourceId: "pubmed:42", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/42/", sourceType: "peer_reviewed", publicationDate: "2026-10-01", retrievedAt: AT, evidenceLevel: "peer_reviewed", confidence: 0.8, verificationStatus: "SUPPORTED", verificationNote: null, supportText: null, provenance }],
    source: provenance, actions: [], attributes: {}, partner: null, dismissed: false, savedMaterialId: null, rank: 1,
  };
}

describe("share links (PostgreSQL)", () => {
  it("a created link survives a restart, counts opens, is listed and revoked only by its owner", async () => {
    const { id: owner } = await ensureSession();
    const { id: other } = await ensureSession();
    const shared = result();
    await workspaceStore().upsertResults(owner, [shared]);
    const created = await executeAgentCommand(owner, { action: "createShare", specialty: "cardiology", resultId: shared.id });
    const token = created.share!.link!.token;

    // A fresh store instance (another serverless instance) reads the same row.
    const globals = globalThis as unknown as { kardioShareStore?: unknown };
    delete globals.kardioShareStore;
    const record = await shareStore().get(token);
    expect(record?.payload.title).toBe(shared.title);
    expect(shareState(record, new Date())).toBe("active");

    await shareStore().recordOpen(token, new Date());
    await shareStore().recordOpen(token, new Date());
    expect((await shareStore().get(token))?.openCount).toBe(2);

    expect((await shareStore().list(owner, "cardiology")).map(item => item.token)).toEqual([token]);
    expect(await shareStore().list(other, "cardiology")).toEqual([]);
    expect(await shareStore().revoke(other, token, new Date())).toBe(false);
    expect(await shareStore().revoke(owner, token, new Date())).toBe(true);
    expect(shareState(await shareStore().get(token), new Date())).toBe("revoked");
  });

  it("an expired link is reported as expired, not as active", async () => {
    const { id: owner } = await ensureSession();
    const created = new Date(Date.now() - 31 * 86_400_000);
    const token = newShareToken();
    await shareStore().create({ token, sessionId: owner, specialty: "cardiology", sourceId: "res-old", createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + 30 * 86_400_000).toISOString(), revokedAt: null, openCount: 0, lastOpenedAt: null, payload: buildSharedSnapshot(result(), created) });
    expect(shareState(await shareStore().get(token), new Date())).toBe("expired");
  });
});

afterAll(async () => {
  await pool.end();
});

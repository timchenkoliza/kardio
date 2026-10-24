import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentResult, Evidence } from "@/lib/agents/types";
import { buildSharedSnapshot, SHARE_TOKEN, shareBlocker } from "@/lib/sharing/snapshot";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { shareState, shareStore } from "@/server/sharing/store";

/**
 * F1 «Поделиться материалом» (docs/CAPABILITY_COVERAGE_MATRIX.md, community.share):
 * a link is a frozen copy of one public result; own files, partner material
 * and anything with a personal identifier never leave the workspace; a link
 * expires and can be revoked; nothing else of the workspace is in it.
 */

const SESSION = "c".repeat(64);
const OTHER = "f".repeat(64);
const AT = "2026-10-19T10:00:00.000Z";

function evidence(patch: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-1", claim: "Dapagliflozin reduced the composite of worsening heart failure or cardiovascular death.", sourceId: "pubmed:123", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/123/", sourceType: "peer_reviewed", publicationDate: "2026-10-01", retrievedAt: AT, evidenceLevel: "peer_reviewed", confidence: 0.8, verificationStatus: "SUPPORTED", verificationNote: null, supportText: null,
    provenance: { connectorId: "pubmed", source: "N Engl J Med", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/123/", publisher: "NEJM", retrievedAt: AT, publishedAt: "2026-10-01", version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    ...patch,
  };
}

function result(patch: Partial<AgentResult> = {}): AgentResult {
  return {
    id: `res-${crypto.randomUUID()}`, key: `k-${crypto.randomUUID()}`, agentId: "whats_new", specialty: "cardiology", runId: "run-1", kind: "research_finding", category: null,
    title: "Дапаглифлозин при сердечной недостаточности: новое РКИ", summary: "Снижение комбинированной конечной точки по сравнению с плацебо.", reasonShown: ["тема: ХСН"],
    createdAt: AT, observedAt: "2026-10-01", evidence: [evidence()],
    source: { connectorId: "pubmed", source: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/123/", publisher: "NCBI", retrievedAt: AT, publishedAt: "2026-10-01", version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    actions: [], attributes: { private: "заметка врача" }, partner: null, dismissed: false, savedMaterialId: "mat-1", rank: 1,
    ...patch,
  };
}

describe("what may be shared", () => {
  it("a public result is shareable; the copy holds title, short text and public sources only", () => {
    const value = result();
    expect(shareBlocker(value)).toBeNull();
    const snapshot = buildSharedSnapshot(value, new Date(AT));
    expect(Object.keys(snapshot).sort()).toEqual(["kind", "schema", "sharedAt", "sources", "specialty", "summary", "title", "typeLabel"]);
    expect(JSON.stringify(snapshot)).not.toMatch(/заметка врача|mat-1|run-1|тема: ХСН/u);
    expect(snapshot.sources.map(source => source.url)).toEqual(["https://pubmed.ncbi.nlm.nih.gov/123/"]);
    expect(snapshot.typeLabel).toBe("Исследование");
  });

  it("own files, partner material, personal data and one described patient are never shared", () => {
    expect(shareBlocker(result({ agentId: "materials", kind: "material_hit" }))).toBe("private_material");
    expect(shareBlocker(result({ evidence: [evidence({ provenance: { ...evidence().provenance, ownership: "USER_UPLOADED" } })] }))).toBe("private_material");
    expect(shareBlocker(result({ partner: { sponsor: "Компания", label: "Партнёрский материал", disclosure: "Материал подготовлен при поддержке компании", synthetic: true } }))).toBe("partner");
    expect(shareBlocker(result({ summary: "Связаться: +7 912 345-67-89" }))).toBe("personal_data");
    expect(shareBlocker(result({ title: "Мой пациент с ХСН и дапаглифлозин" }))).toBe("personal_data");
    expect(shareBlocker(result({ summary: "Пациент 67 лет, ФВ 30%" }))).toBe("personal_data");
    // A placeholder left by earlier masking means the original held an identifier.
    expect(shareBlocker(result({ summary: "ФИО: [REDACTED], диагноз ХСН" }))).toBe("personal_data");
  });

  it("without a public web link there is nothing to cite: internal paths and other schemes do not count", () => {
    const internal = result({ source: { ...result().source, sourceUrl: "/cardiology/item/x" }, evidence: [evidence({ sourceUrl: "javascript:alert(1)" })] });
    expect(shareBlocker(internal)).toBe("no_public_source");
  });
});

describe("share links (memory store)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
  });

  it("preview → create → open → revoke; another session cannot revoke; the server re-checks the gate", async () => {
    const store = workspaceStore();
    const shared = result();
    const blocked = result({ summary: "Пациент 54 лет, ФВ 35%" });
    await store.upsertResults(SESSION, [shared, blocked]);

    const preview = await executeAgentCommand(SESSION, { action: "previewShare", specialty: "cardiology", resultId: shared.id });
    expect(preview.share?.snapshot?.title).toBe(shared.title);
    expect(preview.share?.link).toBeNull();

    const refused = await executeAgentCommand(SESSION, { action: "previewShare", specialty: "cardiology", resultId: blocked.id });
    expect(refused.share?.snapshot).toBeNull();
    expect(refused.share?.blocker).toMatch(/персональные данные/u);
    await expect(executeAgentCommand(SESSION, { action: "createShare", specialty: "cardiology", resultId: blocked.id })).rejects.toMatchObject({ status: 422 });

    // A result of another session is not found, not shared.
    await expect(executeAgentCommand(OTHER, { action: "createShare", specialty: "cardiology", resultId: shared.id })).rejects.toMatchObject({ status: 404 });

    const created = await executeAgentCommand(SESSION, { action: "createShare", specialty: "cardiology", resultId: shared.id });
    const link = created.share!.link!;
    expect(link.token).toMatch(SHARE_TOKEN);
    expect(link.url).toBe(`/s/${link.token}`);
    expect(Date.parse(link.expiresAt) - Date.parse(link.createdAt)).toBe(30 * 86_400_000);

    const record = await shareStore().get(link.token);
    expect(shareState(record, new Date())).toBe("active");
    expect(shareState(record, new Date(Date.parse(link.expiresAt) + 1))).toBe("expired");
    expect((await shareStore().list(SESSION, "cardiology")).map(item => item.token)).toContain(link.token);
    expect(await shareStore().list(OTHER, "cardiology")).toEqual([]);

    await expect(executeAgentCommand(OTHER, { action: "revokeShare", specialty: "cardiology", token: link.token })).rejects.toMatchObject({ status: 404 });
    await executeAgentCommand(SESSION, { action: "revokeShare", specialty: "cardiology", token: link.token });
    expect(shareState(await shareStore().get(link.token), new Date())).toBe("revoked");
  });

  it("on a serverless deployment without a database, sharing is refused instead of creating a link that would not open", async () => {
    process.env.VERCEL = "1";
    const shared = result();
    await workspaceStore().upsertResults(SESSION, [shared]);
    const preview = await executeAgentCommand(SESSION, { action: "previewShare", specialty: "cardiology", resultId: shared.id });
    expect(preview.share?.snapshot).toBeNull();
    expect(preview.share?.blocker).toMatch(/постоянном хранилище/u);
    await expect(executeAgentCommand(SESSION, { action: "createShare", specialty: "cardiology", resultId: shared.id })).rejects.toMatchObject({ status: 503 });
  });
});

describe("the shared page", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
  });

  it("shows the frozen copy with sources and a snapshot date; counts the open; is never indexed", async () => {
    vi.resetModules();
    const { default: SharedPage, generateMetadata } = await import("@/app/s/[token]/page");
    const shared = result();
    await workspaceStore().upsertResults(SESSION, [shared]);
    const { share } = await executeAgentCommand(SESSION, { action: "createShare", specialty: "cardiology", resultId: shared.id });
    const params = Promise.resolve({ token: share!.link!.token });
    const html = renderToStaticMarkup(await SharedPage({ params })).replace(/\u00a0/gu, " ");
    expect(html).toContain(shared.title);
    expect(html).toContain("https://pubmed.ncbi.nlm.nih.gov/123/");
    expect(html).toMatch(/Копия материала от .*не обновляется/u);
    expect(html).not.toMatch(/заметка врача/u);
    expect((await shareStore().get(share!.link!.token))?.openCount).toBe(1);
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false });
  });

  it("a revoked, expired or unknown link says it no longer works and shows nothing of the material", async () => {
    vi.resetModules();
    const { default: SharedPage } = await import("@/app/s/[token]/page");
    const shared = result();
    await workspaceStore().upsertResults(SESSION, [shared]);
    const { share } = await executeAgentCommand(SESSION, { action: "createShare", specialty: "cardiology", resultId: shared.id });
    await executeAgentCommand(SESSION, { action: "revokeShare", specialty: "cardiology", token: share!.link!.token });
    const revoked = renderToStaticMarkup(await SharedPage({ params: Promise.resolve({ token: share!.link!.token }) })).replace(/\u00a0/gu, " ");
    expect(revoked).toMatch(/Ссылка больше не действует/u);
    expect(revoked).toMatch(/отозвал/u);
    expect(revoked).not.toContain(shared.title);
    const unknown = renderToStaticMarkup(await SharedPage({ params: Promise.resolve({ token: "not-a-token" }) })).replace(/\u00a0/gu, " ");
    expect(unknown).toMatch(/Такой ссылки нет/u);
  });
});

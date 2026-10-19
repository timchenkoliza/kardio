import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { defaultProfile } from "@/lib/agents/profile";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { getWorkspaceView } from "@/server/agents/workspace";
import { ensureSession } from "@/server/services/state";

describe("agent workspace persistence (PostgreSQL)", () => {
  it("uses the PostgreSQL store when DATABASE_URL is configured", () => {
    expect(workspaceStore().kind).toBe("postgres");
  });

  it("persists profile, runs, stable results, materials and actions per session", async () => {
    const { id } = await ensureSession();
    const store = workspaceStore();
    const profile = defaultProfile("cardiology");
    profile.interests.topics = ["ah"];
    await store.saveProfile(id, profile);
    expect((await store.getProfile(id, "cardiology"))?.interests.topics).toEqual(["ah"]);

    const first = await executeAgentCommand(id, { action: "runAgent", specialty: "cardiology", agentId: "drugs" });
    const firstResults = await store.listResults(id, "cardiology", "drugs");
    expect(firstResults.length).toBeGreaterThan(0);
    const second = await executeAgentCommand(id, { action: "runAgent", specialty: "cardiology", agentId: "drugs" });
    const secondResults = await store.listResults(id, "cardiology", "drugs");
    expect(second.runId).not.toBe(first.runId);
    expect(secondResults.length).toBe(firstResults.length);
    const byKey = new Map(firstResults.map(result => [result.key, result]));
    for (const result of secondResults) expect(result.createdAt).toBe(byKey.get(result.key)?.createdAt);

    await executeAgentCommand(id, { action: "addNote", specialty: "cardiology", title: "Заметка", note: "ХСН и иНГЛТ-2" });
    expect((await store.listMaterials(id, "cardiology")).length).toBe(1);

    const view = await getWorkspaceView(id, "cardiology");
    expect(view.cards.find(card => card.agentId === "drugs")?.totalResults).toBeGreaterThan(0);

    const other = await ensureSession();
    expect(await store.listMaterials(other.id, "cardiology")).toHaveLength(0);
    expect(await store.listResults(other.id, "cardiology")).toHaveLength(0);
  });
});

afterAll(async () => {
  await pool.end();
});

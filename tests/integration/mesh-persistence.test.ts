import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { defaultProfile } from "@/lib/agents/profile";
import { experienceManifestSchema } from "@/lib/mesh/manifest";
import { compileIntent } from "@/lib/mesh/intent";
import { runAgent } from "@/server/agents/supervisor";
import { workspaceStore } from "@/server/agents/store";
import { listContent, listSources } from "@/server/repositories/catalog";
import { ensureSession } from "@/server/services/state";
import { fakeAbstracts, fakeDrugLabel, fakePubmed } from "@/tests/unit/agent-test-utils";
import { ACCEPTANCE_QUESTION, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW } from "@/tests/unit/mesh-test-utils";

describe("compiled experience persistence (PostgreSQL)", () => {
  it("stores the manifest and evidence graph with the run and reads them back renderable", async () => {
    const { id } = await ensureSession();
    const store = workspaceStore();
    expect(store.kind).toBe("postgres");
    const profile = defaultProfile("cardiology");
    const [content, sources] = await Promise.all([listContent("cardiology"), listSources("cardiology")]);
    const outcome = await runAgent(
      { store, sessionId: id, catalog: { content, sources }, pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]), drugLabel: fakeDrugLabel(), browserDriver: new FixtureDriver() },
      { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: ACCEPTANCE_QUESTION, job: "guidelines", intent: compileIntent(ACCEPTANCE_QUESTION, "cardiology") },
    );
    expect(outcome.run.experience?.manifest.intent.job).toBe("guideline_check");
    const stored = await store.getRun(id, outcome.run.id);
    expect(stored?.experience).toEqual(outcome.run.experience);
    expect(experienceManifestSchema.safeParse(stored?.experience?.manifest).success).toBe(true);
    // Every document the manifest shows resolves to a persisted result (save / open tracking).
    const results = await store.listResults(id, "cardiology", "reference");
    const keys = new Set(results.map(result => result.key));
    const shown = stored!.experience!.manifest.modules.flatMap(entry => entry.resultKeys);
    expect(shown.length).toBeGreaterThan(0);
    for (const key of shown) expect(keys.has(key)).toBe(true);
  });

  afterAll(async () => { await pool?.end(); });
});

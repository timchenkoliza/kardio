import { beforeEach, describe, expect, it } from "vitest";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";

const SESSION = "f".repeat(64);

delete process.env.DATABASE_URL;

beforeEach(() => resetMemorySession(SESSION));

describe("agent configuration launches the fresh run", () => {
  it("uses the newly saved drug topics instead of the previous profile scope", async () => {
    await executeAgentCommand(SESSION, {
      action: "setInterests",
      specialty: "cardiology",
      topics: ["ihd"],
      trustedSources: [],
      excludedSources: ["pubmed"],
      runAgents: false,
    });

    const configured = await executeAgentCommand(SESSION, {
      action: "configureAgent",
      specialty: "cardiology",
      agentId: "drugs",
      preference: { topics: ["ah"], horizonDays: 365 },
      run: true,
    });

    expect(configured.runId).toBeTruthy();
    const store = workspaceStore();
    const run = await store.getRun(SESSION, configured.runId!);
    const results = await store.listResults(SESSION, "cardiology", "drugs");
    const visible = results.filter(result => run?.resultIds.includes(result.id));

    expect(visible.some(result => result.attributes.inn === "баксдростат")).toBe(true);
    expect(visible.some(result => result.attributes["drugAssessment.officialVerification"] === "needs_grls")).toBe(true);
    expect(run?.input.preferenceDigest).toContain("ah");
    expect(run?.input.preferenceDigest).not.toContain("ihd");
  });
});

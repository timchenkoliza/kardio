import { beforeEach, describe, expect, it } from "vitest";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";

/**
 * B-02 / UXR-13: a topic added from the home nudge never touches source
 * preferences. The nudge used to send back the page's copy of «Приоритет» and
 * «Не использовать»; a page rendered a moment before the physician excluded a
 * source then silently re-enabled it (seen in e2e on release/r1).
 */

const SESSION = "9".repeat(64);

describe("adding a topic from the home nudge", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("adds the topic on the server and keeps trusted and excluded sources as stored", async () => {
    await executeAgentCommand(SESSION, { action: "setInterests", specialty: "cardiology", topics: [], trustedSources: ["rko"], excludedSources: ["lancet"], runAgents: false });
    const response = await executeAgentCommand(SESSION, { action: "addTopic", specialty: "cardiology", topic: "hf", runAgents: false });
    expect(response.profileChanged).toBe(true);
    const profile = (await workspaceStore().getProfile(SESSION, "cardiology"))!;
    expect(profile.interests).toEqual({ topics: ["hf"], trustedSources: ["rko"], excludedSources: ["lancet"] });
    expect(profile.topicsChangedAt).not.toBeNull();
  });

  it("is idempotent and accepts no source fields at all", async () => {
    await executeAgentCommand(SESSION, { action: "addTopic", specialty: "cardiology", topic: "hf", runAgents: false });
    expect((await executeAgentCommand(SESSION, { action: "addTopic", specialty: "cardiology", topic: "hf", runAgents: false })).profileChanged).toBe(false);
    // The request schema refuses source fields on this command: a page cannot send its copy back.
    expect(agentCommandSchema.safeParse({ action: "addTopic", specialty: "cardiology", topic: "hf", excludedSources: [] }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ action: "addTopic", specialty: "cardiology", topic: "hf" }).success).toBe(true);
  });
});

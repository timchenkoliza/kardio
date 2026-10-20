import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentRun } from "@/lib/agents/types";
import type { ResearchRunOptions } from "@/lib/agents/research-options";
import { listResearchJobs, processResearchJob, queueResearchJob, resetResearchJobsForTest } from "@/server/agents/research-jobs";

const sessionId = "research-background-test-session";
const previousDatabaseUrl = process.env.DATABASE_URL;

const options: ResearchRunOptions = {
  mode: "academic",
  sourceScope: "international",
  contentScope: "research",
  includeDomains: ["pubmed.ncbi.nlm.nih.gov"],
  excludeDomains: [],
};

beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetResearchJobsForTest(sessionId);
});

afterEach(() => {
  resetResearchJobsForTest(sessionId);
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("background research jobs", () => {
  it("persists a queued job independently from the final AgentRun", async () => {
    const job = await queueResearchJob(sessionId, "cardiology", "atrial fibrillation anticoagulation", options);
    expect(job.status).toBe("queued");
    expect(job.runId).toBeNull();
    expect(job.options.includeDomains).toEqual(["pubmed.ncbi.nlm.nih.gov"]);

    const stored = await listResearchJobs(sessionId, "cardiology");
    expect(stored.map(item => item.id)).toContain(job.id);
  });

  it("moves queued → running → completed and links the final run", async () => {
    const job = await queueResearchJob(sessionId, "cardiology", "atrial fibrillation anticoagulation", options);
    const fakeRun: AgentRun = {
      id: "run-background-result",
      agentId: "research",
      specialty: "cardiology",
      trigger: "composer",
      startedAt: "2026-10-20T00:00:00.000Z",
      completedAt: "2026-10-20T00:00:05.000Z",
      status: "completed",
      input: { text: "atrial fibrillation anticoagulation", preferenceDigest: "test" },
      intent: "research_question",
      plan: [],
      toolsUsed: [],
      resultIds: ["res-1", "res-2"],
      newResultCount: 2,
      error: null,
      durationMs: 5000,
      riskNotices: [],
      synthesis: "summary",
    };

    const completed = await processResearchJob(sessionId, job.id, async () => ({ run: fakeRun, results: [], actions: [], routed: null }));
    expect(completed?.status).toBe("completed");
    expect(completed?.runId).toBe("run-background-result");
    expect(completed?.resultCount).toBe(2);
    expect(completed?.startedAt).not.toBeNull();
    expect(completed?.completedAt).toBe("2026-10-20T00:00:05.000Z");
  });

  it("normalizes domain policy before queueing", async () => {
    const job = await queueResearchJob(sessionId, "cardiology", "heart failure", {
      ...options,
      includeDomains: ["https://WWW.PUBMED.NCBI.NLM.NIH.GOV/", "example.com"],
      excludeDomains: ["example.com"],
    });
    expect(job.options.includeDomains).toEqual(["pubmed.ncbi.nlm.nih.gov"]);
    expect(job.options.excludeDomains).toEqual(["example.com"]);
  });
});

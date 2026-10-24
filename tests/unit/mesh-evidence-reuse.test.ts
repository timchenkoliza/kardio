import { beforeEach, describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { compileIntent } from "@/lib/mesh/intent";
import type { PubmedQuery, PubmedSearchResult } from "@/server/agents/adapters/pubmed";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";
import { createRun, runAgent } from "@/server/agents/supervisor";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { evidenceReuseKey } from "@/server/mesh/executor";
import { listContent, listSources } from "@/server/repositories/catalog";
import { ensureSession } from "@/server/services/state";
import { fakeAbstracts, fakeArticle, fakeDrugLabel } from "./agent-test-utils";
import { FixtureDriver } from "./mesh-test-utils";

/**
 * Evidence reuse across requests (server/mesh/executor.ts). Found in the agent
 * MVP readiness check (docs/agent-mvp/MEETING.md): different questions with the
 * same interpreted intent were answered with the first question's publications.
 */

const DAPT = "Длительность двойной антитромбоцитарной терапии после ЧКВ";
const HCM = "Гипертрофическая кардиомиопатия: лечение";
const PH = "Лечение лёгочной гипертензии";
const ENDOCARDITIS = "Профилактика инфекционного эндокардита";

describe("evidence reuse key", () => {
  it("separates different questions that share one interpreted intent", () => {
    const intents = [DAPT, HCM, PH, ENDOCARDITIS].map(text => compileIntent(text, "cardiology"));
    // The defect on main: the interpreted intent alone could not tell these questions apart. After the
    // fix/ux-recovery merge the intent records more of the question, but the reuse key must not depend on that.
    expect(new Set(intents.map(intent => evidenceReuseKey(intent, []))).size).toBe(4);
  });

  it("keeps reuse for the same question, whatever the order of excluded sources", () => {
    const once = compileIntent(HCM, "cardiology");
    const again = compileIntent(HCM, "cardiology");
    expect(evidenceReuseKey(once, ["esc", "regulators"])).toBe(evidenceReuseKey(again, ["regulators", "esc", "esc"]));
    expect(evidenceReuseKey(once, ["esc"])).not.toBe(evidenceReuseKey(once, []));
  });

  it("tells apart questions that differ only in Latin terms", () => {
    const one = compileIntent("SGLT2 при сердечной недостаточности", "cardiology");
    const other = compileIntent("ARNI при сердечной недостаточности", "cardiology");
    expect(evidenceReuseKey(one, [])).not.toBe(evidenceReuseKey(other, []));
  });
});

describe("a later question is never answered with an earlier question's evidence", () => {
  const SESSION = "9".repeat(64);
  const DAPT_REVIEW = { ...fakeArticle("39000001", "Duration of dual antiplatelet therapy after percutaneous coronary intervention: a meta-analysis"), journal: "Lancet", publicationTypes: ["Meta-Analysis"] };
  const HCM_REVIEW = { ...fakeArticle("39000002", "Treatment of hypertrophic cardiomyopathy: a systematic review"), journal: "Lancet", publicationTypes: ["Systematic Review"] };
  const terms: string[] = [];
  const pubmed = async (query: PubmedQuery): Promise<PubmedSearchResult> => {
    terms.push(query.term);
    const articles = /cardiomyopath/iu.test(query.term) ? [HCM_REVIEW] : /antiplatelet|percutaneous|pci/iu.test(query.term) ? [DAPT_REVIEW] : [];
    return { status: "ok", query: query.term, total: articles.length, articles, error: null, durationMs: 1 };
  };

  beforeEach(async () => {
    resetBrowserToolState();
    (globalThis as { kardioKnowledge?: unknown }).kardioKnowledge = undefined;
    terms.length = 0;
    delete process.env.DATABASE_URL;
    resetMemorySession(SESSION);
    await ensureSession(SESSION);
  });

  async function ask(text: string): Promise<AgentRun> {
    const store = workspaceStore();
    const profile = defaultProfile("cardiology");
    const run = await createRun(store, SESSION, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text, job: "answer", context: { entities: [], answered: null, planConfirmed: null } });
    const [content, sources] = await Promise.all([listContent("cardiology"), listSources("cardiology")]);
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: { content, sources }, browserDriver: new FixtureDriver(), pubmed, abstracts: fakeAbstracts([]), drugLabel: fakeDrugLabel() }, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text, job: "answer", intent: compileIntent(text, "cardiology"), run });
    return outcome.run;
  }

  const documents = (run: AgentRun) => run.experience?.graph.documents.map(document => document.title) ?? [];
  const reused = (run: AgentRun) => run.plan.some(step => step.detail?.includes("из недавно проверенных"));

  it("searches again for a different question and shows its own publications", async () => {
    const first = await ask(DAPT);
    expect(documents(first).join(" ")).toMatch(/antiplatelet/iu);
    const searchedBefore = terms.length;

    const second = await ask(HCM);
    expect(reused(second)).toBe(false);
    expect(terms.length).toBeGreaterThan(searchedBefore);
    expect(documents(second).join(" ")).not.toMatch(/antiplatelet/iu);
    expect(documents(second).join(" ")).toMatch(/cardiomyopathy/iu);
  });

  it("still reuses the evidence of the same question", async () => {
    await ask(HCM);
    const searchedBefore = terms.length;
    const again = await ask(HCM);
    expect(reused(again)).toBe(true);
    expect(terms.length).toBe(searchedBefore);
    expect(documents(again).join(" ")).toMatch(/cardiomyopathy/iu);
  });
});

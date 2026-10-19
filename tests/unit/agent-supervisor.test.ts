import { beforeEach, describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { isNewSinceLastSeen } from "@/lib/agents/profile";
import { createPlan, mergeResults, runAgent, validateEvidence } from "@/server/agents/supervisor";
import { MemoryWorkspaceStore, resetMemorySession } from "@/server/agents/store/memory";
import { buildCard, currentResults } from "@/server/agents/workspace";
import { listContent, listSources } from "@/server/repositories/catalog";
import { buildIcs, icsEventsFromResults, confirmAction, prepareAction } from "@/server/agents/services/action-confirmation";
import { FIXED_NOW, fakeArticle, fakePubmed, profileWith } from "./agent-test-utils";

const SESSION = "a".repeat(64);
const store = new MemoryWorkspaceStore();

async function catalog(specialty: "cardiology" | "oncology" = "cardiology") {
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  return { content, sources };
}

beforeEach(() => resetMemorySession(SESSION));

describe("supervisor: intent → plan → tools → validated evidence", () => {
  it("research agent returns an auditable, evidence-backed result with provenance", async () => {
    const pubmed = fakePubmed([fakeArticle("40000001", "Direct oral anticoagulants in atrial fibrillation with intermediate stroke risk")]);
    const profile = profileWith("cardiology", ["af"]);
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed, now: () => FIXED_NOW }, { agentId: "research", specialty: "cardiology", profile, trigger: "composer", text: "Какие данные о ПОАК при фибрилляции предсердий?" });

    expect(outcome.run.status).toBe("completed");
    expect(outcome.run.plan.map(step => step.label)).toEqual(expect.arrayContaining(["Искали в каталоге РКО и РКЖ", "Искали публикации в PubMed", "Проверили утверждения по источникам"]));
    expect(outcome.run.toolsUsed.map(use => use.tool)).toEqual(expect.arrayContaining(["searchMedical", "searchPubmed", "factCheck", "rankEvidence"]));
    expect(outcome.results.length).toBeGreaterThan(1);
    for (const result of outcome.results) {
      expect(result.evidence.length).toBeGreaterThan(0);
      for (const evidence of result.evidence) {
        expect(evidence.provenance.source).toBeTruthy();
        expect(evidence.retrievedAt).toBeTruthy();
        expect(["SUPPORTED", "PARTIALLY_SUPPORTED", "UNKNOWN"]).toContain(evidence.verificationStatus);
      }
    }
    expect(outcome.run.synthesis).toContain("Чего не хватает");
    expect(pubmed.calls[0]?.term).toContain("atrial fibrillation");
    expect(outcome.results.some(result => result.evidence[0].sourceId === "src-rko-guidelines")).toBe(true);
  });

  it("records PubMed outages honestly instead of faking success", async () => {
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([], "unavailable"), now: () => FIXED_NOW }, { agentId: "research", specialty: "cardiology", profile: profileWith("cardiology", ["ah"]), trigger: "manual", text: "артериальная гипертензия контроль" });
    expect(outcome.run.status).toBe("partial");
    const step = outcome.run.plan.find(item => item.label === "Искали публикации в PubMed");
    expect(step?.status).toBe("skipped");
    expect(outcome.run.toolsUsed.find(use => use.tool === "searchPubmed")?.modes).toEqual(["LIVE"]);
  });

  it("blocks medical image interpretation before any tool runs", async () => {
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "research", specialty: "cardiology", profile: profileWith("cardiology", []), trigger: "composer", text: "Расшифруй ЭКГ пациента" });
    expect(outcome.run.status).toBe("blocked");
    expect(outcome.results).toHaveLength(0);
    expect(outcome.run.toolsUsed).toHaveLength(0);
  });

  it("never shows unsupported organic findings and keeps partner items labelled", () => {
    const base = { agentId: "drugs" as const, specialty: "cardiology" as const, kind: "drug_change" as const, category: null, reasonShown: [], observedAt: null, actions: [], attributes: {}, rank: 0 };
    const provenance = { connectorId: "x", source: "x", sourceUrl: null, publisher: null, retrievedAt: FIXED_NOW.toISOString(), publishedAt: null, version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "none" as const };
    const unsupported = { ...base, key: "u", title: "U", summary: "U", source: provenance, partner: null, evidence: [{ id: "e", claim: "c", sourceId: "x", sourceUrl: null, sourceType: "unknown" as const, publicationDate: null, retrievedAt: "", evidenceLevel: "unknown" as const, confidence: 0, verificationStatus: "UNSUPPORTED" as const, verificationNote: null, supportText: null, provenance }] };
    const partner = { ...base, kind: "partner" as const, key: "p", title: "P", summary: "P", source: { ...provenance, ownership: "PARTNER_SOURCE" as const }, evidence: [], partner: { sponsor: "S", label: "Партнёрский материал", disclosure: "Партнёрский формат · синтетический пример", synthetic: true } };
    const validated = validateEvidence([unsupported, partner]);
    expect(validated.kept.map(item => item.key)).toEqual(["p"]);
    expect(validated.dropped).toBe(1);
  });

  it("exposes a plan template for every user-facing agent", () => {
    for (const id of Object.keys(AGENT_DEFINITIONS) as Array<keyof typeof AGENT_DEFINITIONS>) expect(createPlan(id).length).toBeGreaterThan(1);
  });
});

describe("since last visit is computed, not hard-coded", () => {
  it("keeps first-seen time on re-runs and counts only new keys", () => {
    const draft = { key: "k1", agentId: "drugs" as const, specialty: "cardiology" as const, kind: "drug_change" as const, category: "NEW_REGISTRATION", title: "t", summary: "s", reasonShown: [], observedAt: "2026-08-31", evidence: [], source: { connectorId: "x", source: "x", sourceUrl: null, publisher: null, retrievedAt: "", publishedAt: null, version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "none" as const }, actions: [], attributes: {}, partner: null, rank: 1 };
    const first = mergeResults({ drafts: [draft], existing: [], runId: "r1", now: "2026-10-01T00:00:00.000Z", lastSeenAt: null, rehydrated: false, keyPrefix: "drugs" });
    expect(first.newCount).toBe(1);
    const second = mergeResults({ drafts: [draft, { ...draft, key: "k2" }], existing: first.results, runId: "r2", now: "2026-10-10T00:00:00.000Z", lastSeenAt: "2026-10-05T00:00:00.000Z", rehydrated: false, keyPrefix: "drugs" });
    expect(second.newCount).toBe(1);
    expect(second.results[0].createdAt).toBe("2026-10-01T00:00:00.000Z");
    expect(isNewSinceLastSeen(second.results[0], "2026-10-05T00:00:00.000Z")).toBe(false);
    expect(isNewSinceLastSeen(second.results[1], "2026-10-05T00:00:00.000Z")).toBe(true);
  });

  it("does not resurface old changes as new after a cold-start rehydration", () => {
    const draft = { key: "k1", agentId: "drugs" as const, specialty: "cardiology" as const, kind: "drug_change" as const, category: null, title: "t", summary: "s", reasonShown: [], observedAt: "2026-08-31", evidence: [], source: { connectorId: "x", source: "x", sourceUrl: null, publisher: null, retrievedAt: "", publishedAt: null, version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "none" as const }, actions: [], attributes: {}, partner: null, rank: 1 };
    const merged = mergeResults({ drafts: [draft], existing: [], runId: "r", now: "2026-10-19T00:00:00.000Z", lastSeenAt: "2026-10-10T00:00:00.000Z", rehydrated: true, keyPrefix: "drugs" });
    expect(merged.newCount).toBe(0);
    expect(merged.results[0].createdAt).toBe("2026-10-10T00:00:00.000Z");
  });
});

describe("drug agent: change detection", () => {
  it("reports registrations and restrictions in configured topics with a since-last-visit breakdown", async () => {
    const profile = profileWith("cardiology", ["ah", "cardiomyopathy"]);
    const deps = { store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([fakeArticle("40000002", "Baxdrostat in resistant hypertension")]), now: () => FIXED_NOW };
    const outcome = await runAgent(deps, { agentId: "drugs", specialty: "cardiology", profile, trigger: "manual" });
    const categories = outcome.results.map(result => result.category);
    expect(categories).toContain("NEW_REGISTRATION");
    expect(categories).toContain("NEW_RESTRICTION");
    expect(categories).toContain("IMPORTANT_NEW_STUDY");
    expect(outcome.results.some(result => result.title.includes("Баксдростат зарегистрирован в России"))).toBe(true);
    expect(outcome.results.filter(result => !result.partner).every(result => result.evidence.every(item => item.sourceUrl))).toBe(true);

    const card = buildCard({ definition: AGENT_DEFINITIONS.drugs, profile, specialty: "cardiology", latestRun: outcome.run, current: currentResults(outcome.results, outcome.run), now: FIXED_NOW });
    expect(card.headline).toMatch(/3 регистрации • 1 новое ограничение • 1 исследование/);
    expect(card.newResults).toBe(card.totalResults);

    const seen = structuredClone(profile);
    seen.subscriptions.drugs.lastSeenAt = new Date(FIXED_NOW.getTime() + 60_000).toISOString();
    const afterVisit = buildCard({ definition: AGENT_DEFINITIONS.drugs, profile: seen, specialty: "cardiology", latestRun: outcome.run, current: currentResults(outcome.results, outcome.run), now: FIXED_NOW });
    expect(afterVisit.newResults).toBe(0);
    expect(afterVisit.headline).toBe("С прошлого просмотра изменений нет");
  });

  it("never fills oncology with cardiology drug or event data", async () => {
    const profile = profileWith("oncology", ["breast"]);
    const deps = { store, sessionId: SESSION, catalog: await catalog("oncology"), pubmed: fakePubmed([]), now: () => FIXED_NOW };
    const drugs = await runAgent(deps, { agentId: "drugs", specialty: "oncology", profile, trigger: "manual" });
    const events = await runAgent(deps, { agentId: "events", specialty: "oncology", profile, trigger: "manual" });
    expect(drugs.results.filter(result => !result.partner)).toHaveLength(0);
    expect(events.results).toHaveLength(0);
  });
});

describe("events agent: discovery → relevance → next action", () => {
  it("finds Moscow and online events in the next 60 days and explains why", async () => {
    const profile = profileWith("cardiology", ["hf", "ah", "cardiorenal"], { events: { formats: ["moscow", "online"], horizonDays: 60 } });
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "events", specialty: "cardiology", profile, trigger: "manual" });
    const events = outcome.results.filter(result => result.kind === "event");
    expect(events.length).toBeGreaterThan(2);
    for (const event of events) {
      expect(String(event.attributes.startDate) >= "2026-10-19").toBe(true);
      expect(String(event.attributes.startDate) <= "2026-12-18").toBe(true);
      expect(event.attributes.online === true || event.attributes.region === "moscow").toBe(true);
      expect(event.reasonShown.length).toBeGreaterThan(1);
      expect(event.actions.find(action => action.kind === "registration")?.requiresConfirmation).toBe(true);
      expect(event.actions.find(action => action.kind === "calendar")?.requiresConfirmation).toBe(true);
    }
    expect(events.some(event => event.title.includes("КардиоДиалог 2026"))).toBe(true);
    expect(events.some(event => event.title.includes("AHA"))).toBe(false);
  });

  it("prepares calendar writes for confirmation and builds an ICS with reminders only after confirming", async () => {
    const profile = profileWith("cardiology", ["hf"], { events: { formats: ["moscow", "online"], horizonDays: 60 } });
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "events", specialty: "cardiology", profile, trigger: "composer", text: "Найди события по ХСН, зарегистрируй меня и поставь в календарь", routed: { agentId: "events", intent: "find_events", confidence: 1, topics: ["hf"], reasons: [], risk: { prescribing: false, imageInterpretation: false, emergency: false, patientSpecific: false }, wantsCalendar: true, wantsRegistration: true } });
    const calendar = outcome.actions.find(action => action.kind === "calendar_write");
    expect(calendar?.status).toBe("pending_confirmation");
    expect(calendar?.artifactUrl).toBeNull();
    expect(outcome.actions.filter(action => action.kind === "registration").every(action => action.status === "pending_confirmation" && action.integration.mode === "UNAVAILABLE")).toBe(true);
    const confirmed = confirmAction(calendar!, FIXED_NOW.toISOString());
    expect(confirmed.status).toBe("completed");
    expect(confirmed.artifactUrl).toContain("/ics");
    const ics = buildIcs(icsEventsFromResults(outcome.results), FIXED_NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("never executes purchases or publishing", () => {
    const action = prepareAction({ specialty: "cardiology", kind: "purchase", title: "x", description: "x", effect: "x", agentId: null, results: [], now: FIXED_NOW.toISOString() });
    expect(action.status).toBe("unavailable");
    expect(confirmAction(action, FIXED_NOW.toISOString()).status).toBe("unavailable");
  });
});

describe("whats new and partner separation", () => {
  it("combines catalog, guideline and drug changes and keeps partner content in a labelled slot", async () => {
    const profile = profileWith("cardiology", ["hf", "metabolic", "ah"]);
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([fakeArticle("40000003", "Heart failure outcomes")]), now: () => FIXED_NOW }, { agentId: "whats_new", specialty: "cardiology", profile, trigger: "schedule_catchup" });
    const kinds = new Set(outcome.results.map(result => result.kind));
    expect(kinds.has("update")).toBe(true);
    expect(kinds.has("guideline_change")).toBe(true);
    expect(kinds.has("drug_change")).toBe(true);
    const partner = outcome.results.filter(result => result.partner);
    expect(partner.length).toBeLessThanOrEqual(1);
    for (const item of partner) {
      expect(item.partner?.label).toBe("Партнёрский материал");
      expect(item.evidence).toHaveLength(0);
      expect(item.rank).toBeGreaterThan(100);
    }
    const noPartnerProfile = structuredClone(profile);
    noPartnerProfile.partnerContent = false;
    const without = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "whats_new", specialty: "cardiology", profile: noPartnerProfile, trigger: "manual" });
    expect(without.results.some(result => result.partner)).toBe(false);
  });

  it("never uses prototype editorial drafts as evidence", async () => {
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "research", specialty: "cardiology", profile: profileWith("cardiology", ["ihd"]), trigger: "manual", text: "Ишемическая болезнь сердца что проверить в актуальных рекомендациях" });
    expect(outcome.results.every(result => !result.evidence.some(item => item.sourceId.startsWith("hardcoded-editorial")))).toBe(true);
  });
});

describe("learning agent", () => {
  it("builds a route from current guidelines, developer lectures and flags outdated lectures", async () => {
    const profile = profileWith("cardiology", ["ph", "arrhythmia"], { learning: { goals: ["guideline_refresh", "nmo_points"] } });
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "learning", specialty: "cardiology", profile, trigger: "manual" });
    expect(outcome.results.some(result => result.category === "guideline" && result.title.includes("2024"))).toBe(true);
    expect(outcome.results.some(result => result.category === "lecture")).toBe(true);
    expect(outcome.results.every(result => result.kind === "learning_module")).toBe(true);
  });
});

describe("delegated tasks are scoped by the request", () => {
  it("research answers the question, not the standing interests", async () => {
    const profile = profileWith("cardiology", ["metabolic", "hf", "ah"]);
    const outcome = await runAgent({ store, sessionId: SESSION, catalog: await catalog(), pubmed: fakePubmed([]), now: () => FIXED_NOW }, { agentId: "research", specialty: "cardiology", profile, trigger: "composer", text: "Какие данные о ПОАК при фибрилляции предсердий и промежуточном риске инсульта" });
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every(result => !/Метаболический синдром/.test(result.title))).toBe(true);
    expect(outcome.results.some(result => /фибрилляц/i.test(result.title))).toBe(true);
  });
});

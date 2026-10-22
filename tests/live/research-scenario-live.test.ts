import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildResearchAnswer, type ResearchAnswerKind } from "@/lib/agents/research-answer";
import { decimalText } from "@/lib/agents/research-study-normalization";
import type { AgentResultView } from "@/lib/agents/types";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";
import { executeAskRun, respondToAsk } from "@/server/portal/manager";
import { ensureSession } from "@/server/services/state";

/**
 * The research scenario end to end against live PubMed: the same path as the
 * portal input (route → durable run → executeResearchRun → answer). Skipped
 * unless LIVE_SOURCES=1. LIVE_REPORT=<file> writes the table used in
 * docs/agent-mvp/TEST_RUN.md.
 *
 *   LIVE_SOURCES=1 LIVE_REPORT=docs/agent-mvp/live-run.md npx vitest run tests/live/research-scenario-live.test.ts
 */
const live = process.env.LIVE_SOURCES === "1";
const SESSION = "8".repeat(64);

interface Case {
  id: string;
  text: string;
  expect: ResearchAnswerKind | "clarification";
  why: string;
}

/** The same requests as the team run in docs/agent-mvp/MEETING.md. */
export const CASES: readonly Case[] = [
  { id: "Q1", text: "Разбери статью PMID 31535829", expect: "study", why: "публикация по PMID: дизайн, эффект из текста, вывод авторов, ссылка" },
  { id: "Q2", text: "https://doi.org/10.1056/NEJMoa2107038", expect: "study", why: "публикация по ссылке DOI без слов вокруг" },
  { id: "Q3", text: "ПОАК у пожилых с фибрилляцией предсердий: какие данные?", expect: "question", why: "типовой вопрос сценария" },
  { id: "Q4", text: "Что показало исследование DAPA-HF?", expect: "question", why: "исследование по названию: журнал NEJM не в списке одобренных, поиск по теме может его не найти" },
  { id: "Q5", text: "Разбор исследований", expect: "not_found", why: "недостаточно контекста" },
  { id: "Q6", text: "PMID 99999999", expect: "not_found", why: "несуществующий идентификатор" },
  { id: "Q7", text: "Пациент без сознания, не дышит, разбери исследование по реанимации", expect: "blocked", why: "экстренная ситуация с пациентом" },
  { id: "Q8", text: "Как приготовить борщ? разбор исследований", expect: "not_found", why: "вне компетенции" },
];

interface Row { id: string; text: string; expected: string; got: string; ms: number; studies: number; effects: string; links: number; headline: string }
const rows: Row[] = [];

function linksOk(results: readonly AgentResultView[]): number {
  return results.filter(result => result.actions.some(action => action.href && /^(?:https:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|pmc\.ncbi\.nlm\.nih\.gov)\/|\/)/u.test(action.href))).length;
}

describe.skipIf(!live)("research scenario against live PubMed", () => {
  beforeAll(async () => {
    resetMemorySession(SESSION);
    await ensureSession(SESSION);
  });

  afterAll(() => {
    if (!process.env.LIVE_REPORT) return;
    const lines = [
      `Прогон: ${new Date().toISOString()} · PubMed LIVE · без NCBI_API_KEY: ${process.env.NCBI_API_KEY ? "нет" : "да"}`,
      "",
      "| # | Запрос | Ожидали | Получили | Время, с | Работ в ответе | Эффект (из текста) | Ссылок на первоисточник | Главная строка ответа |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows.map(row => `| ${row.id} | ${row.text} | ${row.expected} | ${row.got} | ${(row.ms / 1000).toFixed(1)} | ${row.studies} | ${row.effects || "—"} | ${row.links} | ${row.headline.replace(/\|/gu, "/")} |`),
    ];
    writeFileSync(process.env.LIVE_REPORT, `${lines.join("\n")}\n`);
  });

  for (const testCase of CASES) {
    it(`${testCase.id}: ${testCase.why}`, async () => {
      const started = Date.now();
      const response = await respondToAsk(SESSION, "cardiology", testCase.text, { schedule: () => {} });
      if (response.kind !== "run") {
        rows.push({ id: testCase.id, text: testCase.text, expected: testCase.expect, got: response.kind, ms: Date.now() - started, studies: 0, effects: "", links: 0, headline: response.kind === "clarification" ? response.clarification.question : "" });
        expect(response.kind).toBe(testCase.expect);
        return;
      }
      await executeAskRun(SESSION, "cardiology", response.runId);
      const store = workspaceStore();
      const run = (await store.getRun(SESSION, response.runId))!;
      const ids = new Set(run.resultIds);
      const results = (await store.listResults(SESSION, "cardiology", run.agentId)).filter(result => ids.has(result.id)).map(result => ({ ...result, newSinceLastSeen: false }) as AgentResultView);
      const answer = buildResearchAnswer(run, results);
      rows.push({
        id: testCase.id,
        text: testCase.text,
        expected: testCase.expect,
        got: run.agentId === "research" ? answer.kind : `${answer.kind} (${run.agentId})`,
        ms: Date.now() - started,
        studies: answer.studies.length,
        effects: answer.studies.map(study => study.effect).filter(Boolean).join("; "),
        links: linksOk(results),
        headline: answer.headline,
      });

      if (testCase.expect !== "blocked") expect(run.agentId).toBe("research");
      expect(answer.kind).toBe(testCase.expect);
      // Every number shown is in the quoted text it came from.
      for (const study of answer.studies.filter(item => item.effect)) {
        expect(study.effectQuote).toBeTruthy();
        // Every number of the effect line (estimate, interval bounds, p) stands in the quoted sentence as a whole number.
        const quote = decimalText(study.effectQuote!);
        for (const number of study.effect!.match(/-?\d+(?:\.\d+)?/gu) ?? []) {
          if (number === "95") continue;
          expect(quote, `${study.effect} ⟵ ${quote}`).toMatch(new RegExp(`(?<![\\d.])${number.replace(".", "\\.").replace("-", "[-−]?")}(?![\\d])`, "u"));
        }
      }
      // Every shown study points to its primary source.
      for (const study of answer.studies) expect(study.links.length + (study.internalHref ? 1 : 0)).toBeGreaterThan(0);
    }, 90_000);
  }
});

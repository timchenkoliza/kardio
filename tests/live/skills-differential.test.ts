import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ShadowComparison } from "@/lib/mesh/execution";
import { SKILL_LIBRARY } from "@/lib/mesh/skills/registry";
import type { IntentSkill } from "@/lib/mesh/skills/types";
import { decideStrategy } from "@/lib/mesh/strategy";
import type { PortalJob } from "@/lib/portal/jobs";
import { retrievalContext } from "@/server/agents/supervisor";
import { evidenceAnswer } from "@/server/mesh/executor";
import { listContent, listSources } from "@/server/repositories/catalog";

/**
 * Differential evaluation of every Skill against the generic path, on live
 * sources: the generic Intent → Evidence → Experience path answers (as on
 * b5317b5) and the Skill runs in shadow on the same question. A Skill may
 * become primary only when every case passes (no lost module, no lost
 * answering source, no unsupported claim shown, no fallback).
 *
 * Run: LIVE_SOURCES=1 DIFF_OUT=report.json npx vitest run tests/live/skills-differential.test.ts
 */
const live = process.env.LIVE_SOURCES === "1";

export const DIFFERENTIAL_CASES: ReadonlyArray<{ skill: string; specialty: SpecialtyId; text: string; job?: PortalJob }> = [
  { skill: "cardiology.guideline_change", specialty: "cardiology", text: "Что изменилось в рекомендациях по ХСН?" },
  { skill: "cardiology.guideline_change", specialty: "cardiology", text: "Какие новые рекомендации по ХСН-сФВ?" },
  { skill: "cardiology.guideline_change", specialty: "cardiology", text: "Сравни текущие рекомендации по ХСН с предыдущими" },
  { skill: "cardiology.guideline_change", specialty: "cardiology", text: "Что изменилось в рекомендациях по фибрилляции предсердий?" },
  { skill: "cardiology.guideline_change", specialty: "cardiology", text: "Что нового в рекомендациях по артериальной гипертензии?" },
  { skill: "cardiology.drug_evidence", specialty: "cardiology", text: "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?" },
  { skill: "cardiology.drug_evidence", specialty: "cardiology", text: "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?" },
  { skill: "cardiology.drug_evidence", specialty: "cardiology", text: "Дапаглифлозин при сердечной недостаточности: актуальные данные" },
  { skill: "cardiology.drug_evidence", specialty: "cardiology", text: "Апиксабан при фибрилляции предсердий — что сейчас в рекомендациях?" },
  { skill: "pediatrics.drug_reference_children", specialty: "pediatrics", text: "Амоксициллин у детей", job: "drug" },
  { skill: "pediatrics.drug_reference_children", specialty: "pediatrics", text: "Амоксициллин у детей" },
  { skill: "pediatrics.drug_reference_children", specialty: "pediatrics", text: "Ибупрофен детям: противопоказания" },
  { skill: "pediatrics.drug_reference_children", specialty: "pediatrics", text: "Парацетамол у детей" },
  { skill: "pediatrics.drug_reference_children", specialty: "pediatrics", text: "Азитромицин детям" },
];

const shadowLibrary: IntentSkill[] = SKILL_LIBRARY.map(skill => ({ ...skill, rollout: { mode: "shadow", change: null } }));

describe.skipIf(!live)("Skill differential evaluation (generic primary, Skill in shadow)", () => {
  it("every Skill is never worse than the generic path", async () => {
    const rows: Array<{ case: (typeof DIFFERENTIAL_CASES)[number]; matched: string | null; confidence: number | null; generic: { modules: string[]; ms: number }; comparison: ShadowComparison | null; error?: string }> = [];
    for (const item of DIFFERENTIAL_CASES) {
      const strategy = decideStrategy({ text: item.text, specialty: item.specialty, job: item.job ?? null, library: shadowLibrary, answered: { id: "evaluation", optionId: null } });
      const [content, sources] = await Promise.all([listContent(item.specialty), listSources(item.specialty)]);
      const ctx = { ...retrievalContext({ agentId: "reference", specialty: item.specialty, profile: defaultProfile(item.specialty), catalog: { content, sources }, sessionId: "differential" }), inputText: item.text, job: item.job ?? null, intent: strategy.intent, strategy };
      const started = Date.now();
      try {
        const out = await evidenceAnswer(ctx);
        const genericMs = Date.now() - started;
        const comparison = out.shadow ? await out.shadow() : null;
        rows.push({ case: item, matched: strategy.skill?.id ?? null, confidence: strategy.matched?.confidence ?? null, generic: { modules: out.experience?.manifest.modules.map(entry => entry.family) ?? [], ms: genericMs }, comparison });
        console.log(`${item.skill.padEnd(36)} «${item.text.slice(0, 48)}» → ${strategy.skill?.id ?? "no match"} ${comparison ? `${comparison.verdict} ${comparison.reasons.join(";")} generic=[${comparison.generic.contentModules}] ${comparison.generic.durationMs}ms skill=[${comparison.skill.contentModules}] ${comparison.skill.durationMs}ms +[${comparison.addedModules}] branches=[${comparison.skill.branches}]` : ""}`);
      } catch (error) {
        rows.push({ case: item, matched: strategy.skill?.id ?? null, confidence: strategy.matched?.confidence ?? null, generic: { modules: [], ms: Date.now() - started }, comparison: null, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (process.env.DIFF_OUT) fs.writeFileSync(process.env.DIFF_OUT, JSON.stringify(rows, null, 1));
    for (const row of rows) {
      expect(row.error).toBeUndefined();
      expect(row.matched).toBe(row.case.skill);
      expect(row.comparison?.verdict, `${row.case.text}: ${row.comparison?.reasons.join(";")}`).toBe("pass");
    }
  }, 600_000);
});

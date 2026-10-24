import { describe, expect, it } from "vitest";
import { redactDirectIdentifiers, REDACTION_RULE_IDS } from "@/lib/clinical-case/anonymizer";
import { unmatchedWords } from "@/lib/portal/unmatched";
import { checkInputRisk, maskStoredRun } from "@/server/agents/services/risk";

/**
 * R1 review C-1 (P0): identifiers typed the way physicians write them are masked before the question is
 * searched, stored or shown — surname with initials, year of birth, street with house and flat, «ФИО» without
 * a colon, a medical record number. A run stored before the rules is masked when read back.
 */
const QUESTION = "Иванов И.И., 1956 г.р., ул. Ленина д. 5 кв. 3: апиксабан при ХБП";

describe("de-identification of a question (R1 C-1)", () => {
  it("the reviewer's question keeps no name, year of birth or address", () => {
    const risk = checkInputRisk(QUESTION);
    expect(risk.sanitizedText).not.toMatch(/Иванов|1956|Ленина|кв\. 3/u);
    expect(risk.sanitizedText).toContain("апиксабан при ХБП");
    expect(risk.redactions).toEqual(expect.arrayContaining(["fio", "birth_date", "address"]));
    expect(risk.notices.length).toBeGreaterThan(0);
  });

  it.each([
    ["И. И. Иванов 1956 года рождения, проспект Мира, 12, кв. 40 — ФП", /Иванов|1956|Мира|40/u],
    ["ФИО Кузнецов Пётр, медкарта № 123456, история болезни 45/2021", /Кузнецов|Пётр|123456|45\/2021/u],
    ["Петрова А., г.р. 1949, д. 7, кв. 12", /Петрова|1949|кв\. 12/u],
    ["Пациентка Петрова Анна Сергеевна, д.р. 12.03.1951, СНИЛС 123-456-789 00", /Петрова|Анна|1951|123-456/u],
  ])("%s", (text, leaked) => {
    expect(checkInputRisk(text).sanitizedText).not.toMatch(leaked);
  });

  it("an ordinary clinical question is left as typed", () => {
    for (const text of ["Мой пациент 67 лет, ФВ 30%: какую дозу бисопролола назначить?", "Апиксабан у пожилых с ХБП: противопоказания", "Рекомендации ESC 2023 г. по ХСН", "Аспирин после ЧКВ у пациентов старше 75 лет", "Что изменилось в рекомендациях по ФП в 2024 году"]) {
      expect(checkInputRisk(text).sanitizedText, text).toBe(text);
      expect(checkInputRisk(text).redactions, text).toEqual([]);
    }
  });

  it("placeholders are not words of the question: «Не учтено в поиске» names none of them", () => {
    const words = unmatchedWords(checkInputRisk(QUESTION).sanitizedText, ["апиксабан", "ХБП"], "cardiology").join(" ");
    expect(words).not.toMatch(/фио|адрес|рождения|иванов|ленина|1956/iu);
  });

  it("the de-identification tool lists the record rule once and counts repeated rules together", () => {
    expect(REDACTION_RULE_IDS).toContain("record");
    expect(new Set(REDACTION_RULE_IDS).size).toBe(REDACTION_RULE_IDS.length);
    const result = redactDirectIdentifiers("Пациент: Иванов Иван; Петров П.П.; Сидоров С.С.");
    expect(result.counts.fio).toBe(3);
    expect(result.detectedMarkers.filter(marker => marker === "fio")).toHaveLength(1);
  });

  it("a run stored before the rules is masked when read back", () => {
    const stored = { id: "run-1", input: { text: QUESTION, continuation: { runId: "run-0", question: QUESTION, followup: "а Петрова А.?" } } };
    const masked = maskStoredRun(stored);
    expect(JSON.stringify(masked)).not.toMatch(/Иванов|1956|Ленина|Петрова/u);
    expect(masked.input.continuation?.runId).toBe("run-0");
    expect(stored.input.text).toBe(QUESTION);
  });
});

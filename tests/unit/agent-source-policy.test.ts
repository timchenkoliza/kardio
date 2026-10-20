import { describe, expect, it } from "vitest";
import { approvedJournals, assessJournal, assessSource, rowsByStanding, SOURCE_VALIDATION } from "@/server/agents/services/source-policy";
import { evidenceFromQuote } from "@/server/agents/services/evidence";
import { factCheck } from "@/server/agents/services/fact-check";

function evidenceAt(url: string, claim = "Отзыв серии препарата", quote = "Отзыв серии препарата") {
  return evidenceFromQuote({ connectorId: "test", sourceName: "Тест", sourceUrl: url, publisher: null, retrievedAt: "2026-10-19T00:00:00.000Z", publishedAt: "2026-10-01", claim, quote, quoteLanguage: "ru", quoteKind: "page_extract", level: "regulatory", secondary: false });
}

describe("physician source validation (B2D)", () => {
  it("keeps the trainers' sheet as data", () => {
    expect(SOURCE_VALIDATION.sources).toHaveLength(59);
    const groups = rowsByStanding();
    expect(groups.rejected.map(row => row.host)).toEqual(expect.arrayContaining(["rnmo.ru", "cyberleninka.ru", "www.medrxiv.org", "www.biorxiv.org"]));
    expect(groups.approved.map(row => row.host)).toEqual(expect.arrayContaining(["cr.minzdrav.gov.ru", "edu.rosminzdrav.ru", "www.cochrane.org"]));
  });

  it("assesses sources by host, section and journal", () => {
    expect(assessSource({ url: "https://cr.minzdrav.gov.ru/recomend/157_4" }).standing).toBe("approved");
    expect(assessSource({ url: "https://rnmo.ru/event/x/" }).standing).toBe("rejected");
    expect(assessSource({ url: "https://www.fda.gov/drugs/news-events" }).standing).toBe("reviewed_not_whitelisted");
    expect(assessSource({ url: "https://www.fda.gov/safety/medwatch-the-fda-safety-information" }).standing).toBe("approved");
    expect(assessSource({ url: "https://www.bmj.com/content/391/bmj-2026" }).standing).toBe("conditional");
    expect(assessSource({ url: "https://scardio.ru/rekomendacii" }).standing).toBe("unreviewed");
    expect(assessSource({ url: "https://pubmed.ncbi.nlm.nih.gov/123/", journal: "Nat Med" }).standing).toBe("approved");
    expect(assessSource({ url: "https://pubmed.ncbi.nlm.nih.gov/123/", journal: "Eur Heart J" }).standing).toBe("reviewed_not_whitelisted");
    expect(assessJournal("Lancet Neurol")?.standing).toBe("conditional");
    expect(approvedJournals()).toEqual(expect.arrayContaining(["Nat Med", "Cochrane Database Syst Rev", "BMJ"]));
  });

  it("never uses a rejected source as evidence and caps non-whitelisted sources", () => {
    const rejected = factCheck(evidenceAt("https://rnmo.ru/event/x/"));
    expect(rejected.verificationStatus).toBe("UNSUPPORTED");
    expect(rejected.verificationNote).toMatch(/отклонён врачами/);
    expect(rejected.provenance.standing).toBe("rejected");

    const notWhitelisted = factCheck(evidenceAt("https://www.fda.gov/drugs/news-events"));
    expect(notWhitelisted.verificationStatus).toBe("PARTIALLY_SUPPORTED");
    expect(notWhitelisted.verificationNote).toMatch(/Не в белом списке врачей/);

    const approved = factCheck(evidenceAt("https://roszdravnadzor.gov.ru/drugs/x"));
    expect(approved.verificationStatus).toBe("SUPPORTED");
    expect(approved.provenance.standing).toBe("approved");

    const unreviewed = factCheck(evidenceAt("https://scardio.ru/x"));
    expect(unreviewed.verificationStatus).toBe("SUPPORTED");
    expect(unreviewed.provenance.standing).toBe("unreviewed");
  });
});

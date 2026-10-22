import { describe, expect, it } from "vitest";
import { doiFromUrl, enrichLink, fallbackTitle, isoFromPubDate, knownSite, pmcidFromUrl, pmidFromUrl } from "@/server/agents/services/link-enrichment";
import { materialFromLink } from "@/server/agents/services/material";

/**
 * «Мои материалы» link enrichment: only identifiers parsed from the link are
 * looked up, at fixed public endpoints; the physician's URL itself is never
 * fetched, and a hostname or path is never a title.
 */

type Call = { url: string };

function fakeFetch(routes: Record<string, { json?: unknown; text?: string; status?: number }>, calls: Call[] = []) {
  return async (url: string) => {
    calls.push({ url });
    const key = Object.keys(routes).find(prefix => url.startsWith(prefix));
    const route = key ? routes[key] : undefined;
    return { ok: Boolean(route) && (route?.status ?? 200) < 400, status: route?.status ?? (route ? 200 : 404), json: async () => route?.json, text: async () => route?.text ?? "" };
  };
}

const ESUMMARY = {
  result: {
    uids: ["42862133"],
    "42862133": {
      title: "Levetiracetam in pregnancy and the risk of major congenital malformations: a cohort study.",
      source: "Neurology",
      fulljournalname: "Neurology",
      pubdate: "2026 Oct 12",
      sortpubdate: "2026/10/12 00:00",
      authors: [{ name: "Ivanova A" }, { name: "Smith B" }, { name: "Lee C" }],
      articleids: [{ idtype: "doi", value: "10.1212/WNL.0000000000000001" }],
      pubtype: ["Journal Article", "Observational Study"],
    },
  },
};
const EFETCH = `<PubmedArticleSet><PubmedArticle><Abstract><AbstractText Label="CONCLUSIONS">No increased risk was observed.</AbstractText></Abstract></PubmedArticle></PubmedArticleSet>`;

describe("identifiers in a saved link", () => {
  it("recognises PubMed, PMC and DOI links", () => {
    expect(pmidFromUrl(new URL("https://pubmed.ncbi.nlm.nih.gov/42862133/"))).toBe("42862133");
    expect(pmidFromUrl(new URL("https://www.ncbi.nlm.nih.gov/pubmed/42862133"))).toBe("42862133");
    expect(pmcidFromUrl(new URL("https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"))).toBe("1234567");
    expect(doiFromUrl(new URL("https://doi.org/10.1093/eurheartj/ehae176"))).toBe("10.1093/eurheartj/ehae176");
    expect(doiFromUrl(new URL("https://www.ahajournals.org/doi/10.1161/STR.0000000000000500"))).toBe("10.1161/STR.0000000000000500");
    expect(doiFromUrl(new URL("https://example.org/articles/1"))).toBeNull();
    expect(isoFromPubDate("2026 Oct 12")).toBe("2026-10-12");
    expect(isoFromPubDate("2026 Oct")).toBe("2026-10");
    expect(isoFromPubDate("2026")).toBe("2026");
  });

  it("never uses a hostname or a path as the title", () => {
    for (const raw of ["https://example.org/some/long/path", "https://www.escardio.org/Guidelines/x", "https://youtu.be/abc", "https://pubmed.ncbi.nlm.nih.gov/42862133/"]) {
      const url = new URL(raw);
      const title = fallbackTitle(url, knownSite(url.hostname), { pmid: pmidFromUrl(url) });
      expect(title).not.toBe(url.hostname + url.pathname);
      expect(title).not.toContain(url.pathname.length > 1 ? url.pathname : "\u0000");
      expect(title).not.toBe(raw);
    }
    expect(fallbackTitle(new URL("https://pubmed.ncbi.nlm.nih.gov/42862133/"), null, { pmid: "42862133" })).toBe("Статья в PubMed (PMID 42862133)");
    expect(fallbackTitle(new URL("https://youtu.be/abc"), knownSite("youtu.be"))).toBe("Видео на YouTube");
  });
});

describe("enrichLink()", () => {
  it("takes title, journal, date, type and abstract from PubMed E-utilities only", async () => {
    const calls: Call[] = [];
    const found = await enrichLink("https://pubmed.ncbi.nlm.nih.gov/42862133/", {
      fetchImpl: fakeFetch({ "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi": { json: ESUMMARY }, "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi": { text: EFETCH } }, calls),
    });
    expect(found).toMatchObject({
      basis: "pubmed",
      title: "Levetiracetam in pregnancy and the risk of major congenital malformations: a cohort study",
      typeLabel: "Наблюдательное исследование",
      format: "study",
      publisher: "Neurology",
      publishedAt: "2026-10-12",
      summary: "Neurology · 12 окт. 2026 г. · Ivanova A и соавт.",
      identifier: "PMID 42862133",
    });
    expect(found.abstract).toContain("No increased risk was observed.");
    // Only the fixed NCBI host was contacted; the physician's URL was not fetched.
    expect(calls.length).toBe(2);
    expect(calls.every(call => call.url.startsWith("https://eutils.ncbi.nlm.nih.gov/"))).toBe(true);
  });

  it("looks a DOI up at Crossref", async () => {
    const calls: Call[] = [];
    const found = await enrichLink("https://doi.org/10.1093/eurheartj/ehae176", {
      fetchImpl: fakeFetch({ "https://api.crossref.org/works/": { json: { message: { title: ["2024 ESC Guidelines for the management of atrial fibrillation"], "container-title": ["European Heart Journal"], published: { "date-parts": [[2024, 8, 30]] }, author: [{ family: "Van Gelder", given: "Isabelle" }] } } } }, calls),
    });
    expect(found).toMatchObject({ basis: "crossref", format: "guideline", publisher: "European Heart Journal", publishedAt: "2024-08-30", identifier: "DOI 10.1093/eurheartj/ehae176" });
    expect(calls).toEqual([{ url: "https://api.crossref.org/works/10.1093%2Feurheartj%2Fehae176" }]);
  });

  it("falls back honestly when the publication database does not answer", async () => {
    const found = await enrichLink("https://pubmed.ncbi.nlm.nih.gov/42862133/", { fetchImpl: fakeFetch({}) });
    expect(found).toMatchObject({ basis: "fallback", title: "Статья в PubMed (PMID 42862133)", publisher: "PubMed", format: "article" });
    expect(found.note).toMatch(/Не удалось получить название/u);
  });

  it("does not touch the network for links without identifiers", async () => {
    const calls: Call[] = [];
    const found = await enrichLink("https://www.nice.org.uk/guidance/ng217", { fetchImpl: fakeFetch({}, calls) });
    expect(calls).toHaveLength(0);
    expect(found).toMatchObject({ basis: "known_site", title: "Материал: NICE", publisher: "NICE" });
  });

  it("a saved link keeps the physician's own title, else the recognised one", async () => {
    const enrichment = await enrichLink("https://pubmed.ncbi.nlm.nih.gov/42862133/", { offline: true });
    const material = materialFromLink({ specialty: "neurology", url: "https://pubmed.ncbi.nlm.nih.gov/42862133/", now: "2026-10-22T00:00:00.000Z", enrichment });
    expect(material.title).toBe("Статья в PubMed (PMID 42862133)");
    expect(material.title).not.toContain("pubmed.ncbi.nlm.nih.gov");
    const own = materialFromLink({ specialty: "neurology", url: "https://pubmed.ncbi.nlm.nih.gov/42862133/", title: "Мой разбор", now: "2026-10-22T00:00:00.000Z", enrichment });
    expect(own.title).toBe("Мой разбор");
    const bare = materialFromLink({ specialty: "neurology", url: "https://example.org/a/b", now: "2026-10-22T00:00:00.000Z" });
    expect(bare.title).toBe("Материал с сайта example.org");
  });
});

import { describe, expect, it } from "vitest";
import { buildPubmedTerm, searchPubmedLive } from "@/server/agents/adapters/pubmed";

type Reply = { status: number; body?: unknown };

function fakeFetch(replies: Reply[]) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const reply = replies.shift() ?? { status: 500 };
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  return { impl, calls };
}

const SEARCH = { esearchresult: { count: "2", idlist: ["111", "222"] } };
const SUMMARY = {
  result: {
    uids: ["111", "222"],
    "111": { title: "Finerenone in <i>heart failure</i>", source: "N Engl J Med", fulljournalname: "The New England journal of medicine", pubdate: "2026 Oct 10", sortpubdate: "2026/10/10 00:00", authors: [{ name: "Doe J" }], articleids: [{ idtype: "doi", value: "10.1/x" }], pubtype: ["Randomized Controlled Trial"] },
    "222": { title: "Second", source: "Eur Heart J", pubdate: "2026 Oct", authors: [], articleids: [], pubtype: [] },
  },
};

describe("PubMed LIVE adapter", () => {
  it("builds a term with journal filter and abstract requirement", () => {
    expect(buildPubmedTerm({ term: "\"heart failure\"[tiab]", journals: ["N Engl J Med"] })).toBe("(\"heart failure\"[tiab]) AND (\"N Engl J Med\"[jour]) AND hasabstract");
  });

  it("returns parsed articles with stable PubMed URLs", async () => {
    const { impl } = fakeFetch([{ status: 200, body: SEARCH }, { status: 200, body: SUMMARY }]);
    const result = await searchPubmedLive({ term: "x-ok", retmax: 2 }, { fetchImpl: impl });
    expect(result.status).toBe("ok");
    expect(result.articles.map(article => article.url)).toEqual(["https://pubmed.ncbi.nlm.nih.gov/111/", "https://pubmed.ncbi.nlm.nih.gov/222/"]);
    expect(result.articles[0].title).toBe("Finerenone in heart failure");
    expect(result.articles[0].doi).toBe("10.1/x");
  });

  it("retries once after HTTP 429 instead of reporting an outage", async () => {
    const { impl, calls } = fakeFetch([{ status: 429 }, { status: 200, body: SEARCH }, { status: 200, body: SUMMARY }]);
    const result = await searchPubmedLive({ term: "x-retry" }, { fetchImpl: impl, timeoutMs: 5000 });
    expect(result.status).toBe("ok");
    expect(calls.filter(url => url.includes("esearch"))).toHaveLength(2);
  });

  it("reports throttling honestly and never fabricates articles", async () => {
    const { impl } = fakeFetch([{ status: 429 }, { status: 429 }]);
    const result = await searchPubmedLive({ term: "x-throttled" }, { fetchImpl: impl, timeoutMs: 5000 });
    expect(result.status).toBe("unavailable");
    expect(result.error).toBe("PubMed временно ограничил частоту запросов");
    expect(result.articles).toHaveLength(0);
  });

  it("marks malformed payloads as failed and disabled connector as unavailable", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { unexpected: true } }]);
    expect((await searchPubmedLive({ term: "x-malformed" }, { fetchImpl: impl })).status).toBe("failed");
    expect((await searchPubmedLive({ term: "x-disabled" }, { fetchImpl: impl, disabled: true })).status).toBe("unavailable");
  });
});

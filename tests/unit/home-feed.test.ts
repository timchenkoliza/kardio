import { describe, expect, it } from "vitest";
import type { AgentResultView } from "@/lib/agents/types";
import { listContent } from "@/server/repositories/catalog";
import { buildHomeFeed } from "@/server/agents/home-feed";
import { profileWith } from "./agent-test-utils";

function agentResult(id: string, title: string, partner = false): AgentResultView {
  return {
    id, agentId: "whats_new", specialty: "cardiology", kind: partner ? "partner" : "update", category: "publication",
    title, summary: "Краткое содержание находки", partner: partner ? { sponsor: "Демо", label: "Партнёрский материал", disclosure: "Пример", synthetic: true } : null,
  } as unknown as AgentResultView;
}

describe("home feed «Что нового для вас»", () => {
  it("opens with an animated ECG, then echo, from current or reviewable catalog material", async () => {
    const content = await listContent("cardiology");
    const feed = buildHomeFeed({ specialty: "cardiology", profile: profileWith("cardiology", []), results: [], content });
    expect(feed.personalized).toBe(false);
    expect(feed.entries.length).toBeGreaterThanOrEqual(6);
    expect(feed.entries[0].media?.modality).toBe("ecg");
    expect(feed.entries[0].media).toMatchObject({ art: "ecg_af", animated: true });
    expect(feed.entries[1].media?.modality).toBe("echo");
    const ids = new Set(feed.entries.map(entry => entry.id));
    for (const item of content.filter(item => item.currentness === "archived" || item.currentness === "superseded")) expect(ids.has(item.id)).toBe(false);
    for (const entry of feed.entries) if (entry.media) expect(entry.media.alt).toMatch(/^Схема /u);
  });

  it("shows exactly one education video, preferring a lecture that is not archived", async () => {
    const content = await listContent("cardiology");
    const feed = buildHomeFeed({ specialty: "cardiology", profile: profileWith("cardiology", ["ah"]), results: [], content });
    const video = content.find(item => item.id === feed.video?.id);
    expect(video?.kind).toBe("video");
    expect(video?.type).toMatch(/лекци/iu);
    expect(video?.currentness).not.toBe("archived");
    expect(video?.topics).toContain("arterial_hypertension");
  });

  it("keeps a labelled partner placement unless the physician switched partner content off", async () => {
    const content = await listContent("cardiology");
    const on = buildHomeFeed({ specialty: "cardiology", profile: profileWith("cardiology", []), results: [], content });
    expect(on.partner?.disclosure).toMatch(/Партнёрский материал/u);
    const profile = profileWith("cardiology", []);
    profile.partnerContent = false;
    expect(buildHomeFeed({ specialty: "cardiology", profile, results: [], content }).partner).toBeNull();
  });

  it("puts agent findings first and never mixes partner results into the organic feed", async () => {
    const content = await listContent("cardiology");
    const results = [agentResult("r1", "Новые данные по антикоагулянтам при фибрилляции предсердий"), agentResult("p1", "Партнёрский блок", true)];
    const feed = buildHomeFeed({ specialty: "cardiology", profile: profileWith("cardiology", ["af"]), results, content });
    expect(feed.entries[0]).toMatchObject({ type: "result", id: "r1" });
    expect(feed.entries.some(entry => entry.id === "p1")).toBe(false);
    expect(feed.entries.filter(entry => entry.type === "catalog").every(entry => entry.type === "catalog" && entry.item.href.startsWith("/cardiology/content/"))).toBe(true);
  });

  it("oncology gets no cardiology fallback: no entries, no video, no partner", async () => {
    const feed = buildHomeFeed({ specialty: "oncology", profile: profileWith("oncology", []), results: [], content: await listContent("cardiology") });
    expect(feed.entries).toHaveLength(0);
    expect(feed.video).toBeNull();
    expect(feed.partner).toBeNull();
  });
});

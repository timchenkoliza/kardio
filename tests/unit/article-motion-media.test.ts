import { describe, expect, it } from "vitest";
import { buildArticleMotionPrompt, shouldQueueArticleMotion } from "@/lib/ui/article-motion-media";

const asset = {
  id: "asset-1",
  url: "https://cdn.example.test/original.jpg",
  sourceUrl: null,
  credit: null,
  caption: null,
  status: "verified",
  rights: "publishable",
  semanticMatch: "exact",
  width: 1200,
  height: 675,
};

describe("article motion media policy", () => {
  it("queues motion only when a generic fallback would otherwise be reused", () => {
    expect(shouldQueueArticleMotion({ asset: null }, true)).toBe(true);
    expect(shouldQueueArticleMotion({ asset: null }, false)).toBe(false);
    expect(shouldQueueArticleMotion({ asset }, true)).toBe(false);
  });

  it("builds a source-anchored conservative prompt", () => {
    const prompt = buildArticleMotionPrompt({
      kind: "clinical",
      title: "Разбор клинического случая",
      summary: "Исходная публикация описывает тактику и визуальный материал.",
      topics: ["кардиология"],
      tags: ["клинический случай"],
    });

    expect(prompt).toContain("supplied original article image");
    expect(prompt).toContain("Do not invent new anatomy, pathology");
    expect(prompt).toContain("Разбор клинического случая");
    expect(prompt).toContain("No text, no watermark");
  });
});

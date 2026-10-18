import { describe, expect, it } from "vitest";
import { parseTelegramDesktopHtml } from "@/server/ingestion/telegram-html";

const SAMPLE = `
<div class="message default clearfix" id="message7">
  <div class="body">
    <div class="pull_right date details" title="18.10.2026 12:34:56 UTC+03:00">12:34</div>
    <div class="from_name">Российское кардиологическое общество</div>
    <div class="text">Лекция по антиаритмической терапии #аритмология<br><a href="https://example.org/lecture">Открыть лекцию</a></div>
    <div class="media_wrap clearfix"><a class="photo_wrap" href="photos/photo_1.jpg"><img src="thumbs/photo_1.jpg"></a></div>
  </div>
</div>
<div class="message service" id="message8">
  <div class="body details">18 October 2026</div>
</div>
`;

describe("Telegram Desktop HTML parser", () => {
  it("extracts stable post identity, date, author, text, links, hashtags and media", () => {
    const posts = parseTelegramDesktopHtml(SAMPLE, { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" });
    expect(posts).toHaveLength(2);

    const post = posts[0];
    expect(post.stableId).toBe("cardiology_channel_01:message:7");
    expect(post.kind).toBe("post");
    expect(post.publishedAt).toBe("2026-10-18T09:34:56.000Z");
    expect(post.authorName).toBe("Российское кардиологическое общество");
    expect(post.text).toContain("антиаритмической терапии");
    expect(post.hashtags).toEqual(["#аритмология"]);
    expect(post.links).toContainEqual({ href: "https://example.org/lecture", label: "Открыть лекцию" });
    expect(post.media).toEqual([{ href: "photos/photo_1.jpg", kind: "photo" }]);
    expect(post.rawFragmentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps service messages separate from professional post candidates", () => {
    const posts = parseTelegramDesktopHtml(SAMPLE, { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" });
    expect(posts[1]).toMatchObject({ messageId: "8", kind: "service", text: "" });
  });

  it("is deterministic", () => {
    const context = { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" as const };
    expect(parseTelegramDesktopHtml(SAMPLE, context)).toEqual(parseTelegramDesktopHtml(SAMPLE, context));
  });
});

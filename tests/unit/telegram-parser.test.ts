import { describe, expect, it } from "vitest";
import { parseTelegramDesktopHtml } from "@/server/ingestion/telegram-html";

const SAMPLE = `
<div class="message default clearfix" id="message7">
  <div class="body">
    <div class="pull_right date details" title="18.10.2026 12:34:56 UTC+03:00">12:34</div>
    <div class="from_name">Российское кардиологическое общество</div>
    <div class="text">Лекция по антиаритмической терапии #аритмология<br><a href="https://example.org/lecture">Открыть лекцию</a></div>
    <div class="media_wrap clearfix"><a class="photo_wrap" href="photos/photo_1.jpg"><img class="photo" src="photos/photo_1.jpg"></a></div>
  </div>
</div>
<div class="message service" id="message8">
  <div class="body details">18 October 2026</div>
</div>
`;

const REAL_EXPORT_FORMAT = `
<div class="message default clearfix" id="message4">
  <div class="body">
    <div class="pull_right date details" title="11 March 2022, 15:28:27">edited 15:28</div>
    <div class="from_name">Российское кардиологическое общество</div>
    <div class="media_wrap clearfix">
      <a class="webpage_preview clearfix" href="https://youtu.be/example">
        <img class="webpage_photo pull_right" src="webpage_thumbs/webpage_4_0.jpg"/>
        <div class="webpage_title bold">Лекция</div>
      </a>
    </div>
    <div class="text">Материал <a onclick="return ShowHashtag('рко_лекция')" href="#">#рко_лекция</a></div>
  </div>
</div>
`;

describe("Telegram Desktop HTML parser", () => {
  it("extracts stable post identity, explicit-offset date, author, text, links, hashtags and media", () => {
    const posts = parseTelegramDesktopHtml(SAMPLE, { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" });
    expect(posts).toHaveLength(2);

    const post = posts[0];
    expect(post.stableId).toBe("cardiology_channel_01:message:7");
    expect(post.kind).toBe("post");
    expect(post.publishedAt).toBe("2026-10-18T09:34:56.000Z");
    expect(post.publishedAtBasis).toBe("offset_explicit");
    expect(post.authorName).toBe("Российское кардиологическое общество");
    expect(post.text).toContain("антиаритмической терапии");
    expect(post.hashtags).toEqual(["#аритмология"]);
    expect(post.links).toContainEqual({ href: "https://example.org/lecture", label: "Открыть лекцию", kind: "external" });
    expect(post.media).toEqual([{ href: "photos/photo_1.jpg", kind: "photo" }]);
    expect(post.rawFragmentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parses the source-local English timestamp format observed in the real export without inventing a timezone", () => {
    const [post] = parseTelegramDesktopHtml(REAL_EXPORT_FORMAT, { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" });
    expect(post.publishedAtRaw).toBe("11 March 2022, 15:28:27");
    expect(post.publishedAt).toBe("2022-03-11T15:28:27");
    expect(post.publishedAtBasis).toBe("source_local");
    expect(post.links).toContainEqual({ href: "https://youtu.be/example", label: "Лекция", kind: "external" });
    expect(post.links).toContainEqual({ href: "#", label: "#рко_лекция", kind: "internal_navigation" });
    expect(post.media).toContainEqual({ href: "webpage_thumbs/webpage_4_0.jpg", kind: "webpage_thumb" });
  });

  it("keeps service messages separate from professional post candidates", () => {
    const posts = parseTelegramDesktopHtml(SAMPLE, { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" });
    expect(posts[1]).toMatchObject({ messageId: "8", kind: "service", text: "", publishedAtBasis: "unknown" });
  });

  it("is deterministic", () => {
    const context = { sourceRegistryId: "cardiology_channel_01", specialty: "cardiology" as const };
    expect(parseTelegramDesktopHtml(SAMPLE, context)).toEqual(parseTelegramDesktopHtml(SAMPLE, context));
    expect(parseTelegramDesktopHtml(REAL_EXPORT_FORMAT, context)).toEqual(parseTelegramDesktopHtml(REAL_EXPORT_FORMAT, context));
  });
});

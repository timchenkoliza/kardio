import { describe, expect, it } from "vitest";
import { eventReferenceMentionId, resolveExplicitScardioEventReference } from "@/server/ingestion/event-reference-resolution";

describe("explicit scardio event reference resolution", () => {
  it("accepts only explicit scardio.ru event-page URLs", () => {
    const resolved = resolveExplicitScardioEventReference(
      "https://scardio.ru/events/forum_molodyh_kardiologov/?utm_source=tg#program",
    );
    expect(resolved).not.toBeNull();
    expect(resolved?.host).toBe("scardio.ru");
    expect(resolved?.basis).toBe("explicit_scardio_event_url");
    expect(resolved?.normalizedUrl).toBe("https://scardio.ru/events/forum_molodyh_kardiologov/?utm_source=tg");
    expect(resolved?.id).toMatch(/^event-ref:[a-f0-9]{64}$/);
  });

  it("does not infer events from other domains or generic scardio pages", () => {
    expect(resolveExplicitScardioEventReference("https://event.scardio.ru/congress")).toBeNull();
    expect(resolveExplicitScardioEventReference("https://scardio.ru/news/example/")).toBeNull();
    expect(resolveExplicitScardioEventReference("not-a-url")).toBeNull();
  });

  it("uses deterministic mention identities", () => {
    const args = {
      distributionCandidateId: "cardiology_channel_01:message:8",
      linkOrdinal: 1,
      eventCandidateId: "event-ref:abc",
    };
    expect(eventReferenceMentionId(args)).toBe(eventReferenceMentionId(args));
    expect(eventReferenceMentionId(args)).toMatch(/^event-ref-mention:[a-f0-9]{64}$/);
  });
});

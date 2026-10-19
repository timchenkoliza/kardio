import { describe, expect, it } from "vitest";
import { resolveEventReferenceTransportIdentity } from "@/server/ingestion/event-reference-transport";

describe("event reference transport identity", () => {
  it("collapses only proven transport variants", () => {
    const a = resolveEventReferenceTransportIdentity(
      "http://scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2024",
    );
    const b = resolveEventReferenceTransportIdentity(
      "https://www.scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2024/",
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.canonicalReferenceUrl).toBe(
      "https://scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2024/",
    );
    expect(a?.id).toBe(b?.id);
  });

  it("preserves query parameters as identifying", () => {
    const withoutQuery = resolveEventReferenceTransportIdentity(
      "https://scardio.ru/events/cikly_vebinarov/kardioring/",
    );
    const withQuery = resolveEventReferenceTransportIdentity(
      "https://scardio.ru/events/cikly_vebinarov/kardioring/?source=telegram",
    );
    expect(withoutQuery?.id).not.toBe(withQuery?.id);
    expect(withQuery?.canonicalReferenceUrl).toContain("?source=telegram");
  });

  it("does not accept unrelated URLs", () => {
    expect(resolveEventReferenceTransportIdentity("https://example.com/events/test/")).toBeNull();
    expect(resolveEventReferenceTransportIdentity("https://scardio.ru/news/test/")).toBeNull();
  });
});

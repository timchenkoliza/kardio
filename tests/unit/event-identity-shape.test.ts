import { describe, expect, it } from "vitest";
import { diagnosticEventReferenceKey, inspectEventReferenceShape } from "@/server/ingestion/event-identity-shape";

describe("event reference identity shape", () => {
  it("reports URL structure without claiming a canonical event identity", () => {
    const result = inspectEventReferenceShape(
      "https://scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2025/tvstudiya",
    );
    expect(result).not.toBeNull();
    expect(result?.eventSegments).toEqual([
      "forum_molodyh_kardiologov",
      "forum_molodyh_kardiologov_2025",
      "tvstudiya",
    ]);
    expect(result?.pathDepth).toBe(3);
    expect(result?.rootSegment).toBe("forum_molodyh_kardiologov");
    expect(result?.leafSegment).toBe("tvstudiya");
    expect(result?.parentUrl).toBe("https://scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2025/");
    expect(result?.yearTokens).toEqual(["2025"]);
  });

  it("diagnostically collapses scheme and trailing-slash differences but preserves query parameters", () => {
    expect(diagnosticEventReferenceKey("http://scardio.ru/events/cikly_vebinarov/kardiobit"))
      .toBe("https://scardio.ru/events/cikly_vebinarov/kardiobit/");
    expect(diagnosticEventReferenceKey("https://www.scardio.ru/events/cikly_vebinarov/kardiobit/"))
      .toBe("https://scardio.ru/events/cikly_vebinarov/kardiobit/");
    expect(diagnosticEventReferenceKey("https://scardio.ru/events/cikly_vebinarov/kardiobit/?source=telegram"))
      .toBe("https://scardio.ru/events/cikly_vebinarov/kardiobit/?source=telegram");
  });

  it("rejects non-scardio and non-event URLs", () => {
    expect(inspectEventReferenceShape("https://example.com/events/test/")).toBeNull();
    expect(inspectEventReferenceShape("https://scardio.ru/news/test/")).toBeNull();
  });
});

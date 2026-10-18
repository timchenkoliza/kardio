import { describe, expect, it } from "vitest";
import { candidateTimestampColumns, reviewStateAfterSourceChange } from "@/server/ingestion/distribution-candidate-policy";

describe("distribution candidate staging policy", () => {
  it("keeps source-local time separate from absolute instants", () => {
    expect(candidateTimestampColumns({
      publishedAt: "2022-03-11T15:28:27",
      publishedAtBasis: "source_local",
    })).toEqual({ publishedAtInstant: null, publishedAtLocal: "2022-03-11T15:28:27" });

    expect(candidateTimestampColumns({
      publishedAt: "2026-10-18T09:34:56.000Z",
      publishedAtBasis: "offset_explicit",
    })).toEqual({ publishedAtInstant: "2026-10-18T09:34:56.000Z", publishedAtLocal: null });
  });

  it("does not invent timestamps for unknown source time", () => {
    expect(candidateTimestampColumns({ publishedAt: null, publishedAtBasis: "unknown" }))
      .toEqual({ publishedAtInstant: null, publishedAtLocal: null });
  });

  it("returns reviewed candidates to review when source bytes change", () => {
    expect(reviewStateAfterSourceChange({ previous: "approved_for_promotion", sourceChanged: true }))
      .toBe("needs_review");
    expect(reviewStateAfterSourceChange({ previous: "parsed", sourceChanged: true }))
      .toBe("parsed");
    expect(reviewStateAfterSourceChange({ previous: "rejected", sourceChanged: false }))
      .toBe("rejected");
  });
});

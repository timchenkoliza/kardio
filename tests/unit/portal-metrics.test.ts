import { describe, expect, it } from "vitest";
import { computePortalRetention, lengthBucket, type PortalTelemetryEvent } from "@/lib/portal/metrics";

const event = (sessionId: string, name: string, createdAt: string, payload: Record<string, unknown> = {}): PortalTelemetryEvent => ({ event: name, sessionId, createdAt, payload: { specialty: "pediatrics", ...payload } });

describe("retention contract", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const events: PortalTelemetryEvent[] = [
    // a: activated with a drug answer, returns on day 1 and day 8
    event("a", "portal_opened", "2026-10-21T08:00:00.000Z"),
    event("a", "first_value_delivered", "2026-10-21T08:00:30.000Z", { job: "drug", ttfvMs: 30_000 }),
    event("a", "portal_opened", "2026-10-22T09:00:00.000Z"),
    event("a", "source_opened", "2026-10-22T09:01:00.000Z"),
    event("a", "portal_opened", "2026-10-29T09:00:00.000Z"),
    // b: activated with an answer, never returns
    event("b", "portal_opened", "2026-10-21T10:00:00.000Z", { specialty: "therapy" }),
    event("b", "first_value_delivered", "2026-10-21T10:02:00.000Z", { specialty: "therapy", job: "answer", ttfvMs: 120_000 }),
    // c: first seen 2 days ago — not eligible for D7/D14 yet
    event("c", "portal_opened", "2026-11-08T10:00:00.000Z"),
  ];
  const report = computePortalRetention(events, now);

  it("computes activation, D1/D7/D14 with eligibility, cohorts and TTFV", () => {
    expect(report.sessions).toBe(3);
    expect(report.activated).toBe(2);
    expect(report.retention.d1).toBe(0.333); // a returned; b did not; c eligible for D1 (2 days old) and did not
    expect(report.retention.d7).toBe(0.5); // c excluded
    expect(report.retention.d14).toBe(0); // a's last visit was day 8
    expect(report.retentionByFirstJob.drug.d7).toBe(1);
    expect(report.retentionByFirstJob.answer.d7).toBe(0);
    expect(report.retentionBySpecialty.therapy.cohortSize).toBe(1);
    expect(report.timeToFirstValueMs).toEqual({ p50: 30_000, p90: 120_000, n: 2 });
  });

  it("counts a repeat useful task only across distinct days", () => {
    expect(report.repeatUsefulSessions).toBe(0);
    const more = computePortalRetention([...events, event("a", "result_saved", "2026-10-30T09:00:00.000Z")], now);
    expect(more.repeatUsefulSessions).toBe(1);
  });

  it("stores the size of a request, never its text", () => {
    expect(lengthBucket("апиксабан")).toBe("short");
    expect(lengthBucket("длительность антибиотикотерапии при остром среднем отите у детей")).toBe("medium");
  });
});

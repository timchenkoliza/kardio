import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import { backgroundAgents, dueAgents, isInactive, isoWeek, nextCheckAt, SCHEDULE_RULES, slotFor } from "@/lib/agents/schedule";

const NOW = new Date("2026-10-24T04:17:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function profile() {
  const value = defaultProfile("cardiology", hoursAgo(24 * 10));
  value.lastVisitAt = hoursAgo(5);
  return value;
}

describe("background schedule rules", () => {
  it("only monitoring agents and learning run in the background; answers, research and materials never do", () => {
    const value = profile();
    value.interests.topics = ["hf"];
    expect(backgroundAgents(value).sort()).toEqual(["drugs", "events", "guidelines", "learning", "whats_new"]);
  });

  it("without topics, zero-setup agents still run; the drug agent waits for topics or a watchlist", () => {
    const value = profile();
    expect(backgroundAgents(value)).not.toContain("drugs");
    value.watchlist = [{ inn: "apixaban", ru: "апиксабан", addedAt: hoursAgo(1), from: "settings" }];
    expect(backgroundAgents(value)).toContain("drugs");
    expect(dueAgents(value, NOW)).toContain("drugs");
  });

  it("an agent that ran within its period is not due; next check is its period end", () => {
    const value = profile();
    for (const agentId of backgroundAgents(value)) value.subscriptions[agentId].lastRunAt = hoursAgo(2);
    expect(dueAgents(value, NOW)).toEqual([]);
    const next = nextCheckAt(value, NOW)!;
    // whats_new is daily: due 22 hours from now.
    expect(next.toISOString()).toBe(new Date(Date.parse(hoursAgo(2)) + 24 * 3_600_000).toISOString());
  });

  it("paused or abandoned workspaces are not checked, and are re-armed by the next visit", () => {
    const paused = profile();
    paused.backgroundPaused = true;
    expect(dueAgents(paused, NOW)).toEqual([]);
    expect(nextCheckAt(paused, NOW)).toBeNull();
    const abandoned = profile();
    abandoned.lastVisitAt = hoursAgo(24 * (SCHEDULE_RULES.inactiveDays + 1));
    expect(isInactive(abandoned, NOW)).toBe(true);
    expect(nextCheckAt(abandoned, NOW)).toBeNull();
    abandoned.lastVisitAt = NOW.toISOString();
    expect(nextCheckAt(abandoned, NOW)).not.toBeNull();
  });

  it("slots: a day for daily agents, an ISO week for weekly ones — the same slot never runs twice", () => {
    const value = profile();
    expect(slotFor(value, "whats_new", NOW)).toBe("whats_new:d:2026-10-24");
    expect(slotFor(value, "guidelines", NOW)).toBe(`guidelines:w:${isoWeek(NOW)}`);
    expect(slotFor(value, "guidelines", new Date("2026-10-25T23:00:00Z"))).toBe(slotFor(value, "guidelines", NOW));
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

import { describe, expect, it } from "vitest";
import { classifyIntent, isNewSinceLastSeen, routeTask, selectAgent } from "@/lib/agent-first/supervisor";

describe("agent-first supervisor", () => {
  it("routes physician event intent to the events agent", () => {
    expect(selectAgent("Найди ближайшие конференции по кардиологии")).toBe("events");
    expect(routeTask("Найди ближайшие конференции по кардиологии").agentId).toBe("events");
  });

  it("routes drug change questions to the drug change agent", () => {
    expect(selectAgent("Что изменилось по антикоагулянтам?")).toBe("drug-change");
  });

  it("keeps an explicit user-selected agent", () => {
    expect(selectAgent("Проверь обновления", "guideline-change")).toBe("guideline-change");
  });

  it("requires approval for act intents", () => {
    expect(classifyIntent("Добавь событие в календарь")).toBe("act");
    expect(routeTask("Добавь событие в календарь").requiresApproval).toBe(true);
  });

  it("computes since-last-visit from real timestamps", () => {
    expect(isNewSinceLastSeen("2026-10-01T00:00:00.000Z", ["2026-10-02T00:00:00.000Z"])).toBe(true);
    expect(isNewSinceLastSeen("2026-10-03T00:00:00.000Z", ["2026-10-02T00:00:00.000Z"])).toBe(false);
    expect(isNewSinceLastSeen(null, ["2026-10-02T00:00:00.000Z"])).toBe(false);
  });
});

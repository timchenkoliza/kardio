import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/therapy/settings",
  useSearchParams: () => new URLSearchParams(),
}));
import { NmoPlanEditor } from "@/components/workspace/nmo-plan";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { normalizeNmoPlan } from "@/lib/agents/profile";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";

/**
 * E2 «Личный план НМО» (docs/CAPABILITY_COVERAGE_MATRIX.md, events.nmo_plan):
 * the physician's own record; credits only as entered; an event added from
 * the listing has none until the physician enters them.
 */

const SESSION = "6".repeat(64);

describe("the НМО plan", () => {
  it("adds, deduplicates, sets credits and the target, removes — in the owner's profile", async () => {
    delete process.env.DATABASE_URL;
    const added = await executeAgentCommand(SESSION, { action: "nmoAdd", specialty: "therapy", title: "Школа по ХСН", date: "2026-11-12", credits: null, kind: "event", from: "event", url: "https://example.org/event" });
    expect(added.notices?.[0]).toMatch(/Баллы не указаны/u);
    expect((await executeAgentCommand(SESSION, { action: "nmoAdd", specialty: "therapy", title: "Школа по ХСН", date: "2026-11-12", credits: null, kind: "event", from: "event", url: null })).profileChanged).toBe(false);
    await executeAgentCommand(SESSION, { action: "nmoAdd", specialty: "therapy", title: "Модуль: гипертензия", date: "2026-10-01", credits: 6, kind: "course", from: "manual", url: null });
    let plan = (await workspaceStore().getProfile(SESSION, "therapy"))!.nmoPlan;
    expect(plan.entries.map(entry => entry.title)).toEqual(["Школа по ХСН", "Модуль: гипертензия"]);
    expect(plan.entries[0]!.credits).toBeNull();
    await executeAgentCommand(SESSION, { action: "nmoSetCredits", specialty: "therapy", id: plan.entries[0]!.id, credits: 4.5 });
    await executeAgentCommand(SESSION, { action: "nmoSetTarget", specialty: "therapy", target: 50 });
    plan = (await workspaceStore().getProfile(SESSION, "therapy"))!.nmoPlan;
    expect(plan).toMatchObject({ target: 50 });
    expect(plan.entries[0]!.credits).toBe(4.5);
    await executeAgentCommand(SESSION, { action: "nmoRemove", specialty: "therapy", id: plan.entries[1]!.id });
    expect((await workspaceStore().getProfile(SESSION, "therapy"))!.nmoPlan.entries).toHaveLength(1);
    await expect(executeAgentCommand(SESSION, { action: "nmoRemove", specialty: "therapy", id: "nope" })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses impossible input and repairs a stored plan", () => {
    expect(agentCommandSchema.safeParse({ action: "nmoAdd", specialty: "therapy", title: "Х", date: "2026-11-12", credits: null, kind: "event" }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ action: "nmoAdd", specialty: "therapy", title: "Школа", date: "12.11.2026", credits: null, kind: "event" }).success).toBe(false);
    expect(agentCommandSchema.safeParse({ action: "nmoSetCredits", specialty: "therapy", id: "x", credits: -1 }).success).toBe(false);
    const repaired = normalizeNmoPlan({ target: -3, entries: [{ id: "a", title: "Ок", date: "2026-01-01", credits: 2 }, { id: "b", title: "Без даты", date: "вчера" }, { id: "c", title: "Ссылка", date: "2026-02-01", credits: null, url: "javascript:alert(1)" }] });
    expect(repaired.target).toBeNull();
    expect(repaired.entries.map(entry => entry.id)).toEqual(["c", "a"]);
    expect(repaired.entries[0]!.url).toBeNull();
  });

  it("totals only entered credits and says how many entries have none", () => {
    const html = renderToStaticMarkup(<WorkspaceProvider specialty="therapy"><NmoPlanEditor plan={{ target: 50, entries: [{ id: "1", title: "Школа", date: "2026-11-12", credits: null, kind: "event", from: "event", url: null, addedAt: "" }, { id: "2", title: "Модуль", date: "2026-10-01", credits: 6, kind: "course", from: "manual", url: null, addedAt: "" }] }} /></WorkspaceProvider>).replace(/ /gu, " ");
    expect(html).toMatch(/<strong>6<\/strong> ЗЕТ внесено из вашей цели 50/u);
    expect(html).toContain("без указанных баллов: 1");
    expect(html).toContain("продукт не знает баллов, которые вы не внесли");
  });
});

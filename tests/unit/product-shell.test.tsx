import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology",
  useSearchParams: () => new URLSearchParams(),
}));

import { CardMediaView } from "@/components/portal/for-you";
import { Mascot } from "@/components/portal/mascot";
import { PortalInput } from "@/components/portal/portal-input";
import { QuickAgents, quickAgentCards } from "@/components/portal/quick-agents";
import { Suggestions } from "@/components/portal/suggestions";
import { AnonymizerTool } from "@/components/workspace/anonymizer-tool";
import { MaterialsWorkspace } from "@/components/workspace/materials-workspace";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { defaultProfile, normalizeProfile } from "@/lib/agents/profile";
import type { Material } from "@/lib/agents/types";
import { redactDirectIdentifiers } from "@/lib/clinical-case/anonymizer";
import { approvedDerivatives } from "@/lib/media/derivatives";
import { ANSWER_MODE_COPY, ANSWER_MODES, DEFAULT_ANSWER_MODE, densityForMode, resolveAnswerMode } from "@/lib/portal/answer-mode";
import { PORTAL_JOBS } from "@/lib/portal/jobs";
import { homeSuggestions } from "@/lib/portal/suggestions";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";
import { createRun } from "@/server/agents/supervisor";
import { loadProfile } from "@/server/agents/workspace";
import { createAskRun } from "@/server/portal/manager";
import { ensureSession } from "@/server/services/state";

/**
 * Product shell contract (UI-01…10): one input with a separate mode control,
 * the mode in run metadata, the profile default, suggestions as queries,
 * quick agents as jobs, a persisted profile, materials contracts, the
 * de-identification tool apart from materials, a decorative mascot, and
 * deterministic media geometry.
 */

const SESSION = "e".repeat(64);
const shellCss = readFileSync("app/styles/product-shell.css", "utf8");
const tokensCss = readFileSync("app/styles/tokens.css", "utf8");

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(<WorkspaceProvider specialty="cardiology">{node}</WorkspaceProvider>);

function material(partial: Partial<Material> = {}): Material {
  return {
    id: "mat-00000000-0000-4000-8000-000000000001", specialty: "cardiology", kind: "note", ownership: "USER_CONTENT", title: "Разбор SCORE2", url: null, note: "Шкала SCORE2", fileName: null,
    parseStatus: "indexed", parseNote: null, redactions: [], textChars: 120, createdAt: "2026-10-20T10:00:00.000Z", provenance: null, collectionIds: [], sourceResultId: null, ...partial,
  } as unknown as Material;
}

beforeEach(async () => {
  delete process.env.DATABASE_URL;
  resetMemorySession(SESSION);
  await ensureSession(SESSION);
});

describe("UI-01 composer: one primary input and a separate mode control", () => {
  it("renders a single textarea, a radiogroup of three modes and a disabled submit while empty", () => {
    const html = render(<PortalInput specialty="cardiology" showModes suggestions={homeSuggestions("cardiology")} />);
    expect(html.match(/<textarea/g)?.length).toBe(1);
    expect(html).toContain('data-state="idle"');
    expect(html.match(/role="radio"/g)?.length).toBe(3);
    expect(html.match(/role="radiogroup"/g)?.length).toBe(1);
    expect(html).toMatch(/<button type="submit" class="ws-composer-run" disabled=""/u);
    expect(html).toContain("Что хотите узнать или сделать?");
    for (const mode of ANSWER_MODES) expect(html).toContain(ANSWER_MODE_COPY[mode].label);
  });

  it("every state is a data attribute the styles key off", () => {
    for (const state of ["idle", "focused", "typing", "submitting", "disabled", "error"] as const) {
      expect(render(<PortalInput specialty="cardiology" forcedState={state} initialText="Апиксабан" />)).toContain(`data-state="${state}"`);
      expect(shellCss).toContain(`[data-state="${state}"]`.replace('[data-state="idle"]', "pt-composer-surface"));
    }
  });
});

describe("UI-02 mode semantics: short / full / research is stored with the request", () => {
  it("the ask command accepts the mode and the run keeps it", async () => {
    expect(agentCommandSchema.parse({ action: "ask", specialty: "cardiology", text: "Апиксабан: противопоказания", answerMode: "short" })).toMatchObject({ answerMode: "short" });
    expect(() => agentCommandSchema.parse({ action: "ask", specialty: "cardiology", text: "Апиксабан", answerMode: "deep" })).toThrow();
    const run = await createRun(workspaceStore(), SESSION, { agentId: "reference", specialty: "cardiology", profile: defaultProfile("cardiology"), trigger: "composer", text: "Апиксабан: противопоказания", answerMode: "research" });
    expect(run.input.answerMode).toBe("research");
    const stored = await workspaceStore().getRun(SESSION, run.id);
    expect(stored?.input.answerMode).toBe("research");
  });

  it("the portal keeps the request mode on the durable run", async () => {
    const { run } = await createAskRun(SESSION, "cardiology", "Апиксабан: противопоказания и взаимодействия", { answerMode: "short" });
    expect(run.input.answerMode).toBe("short");
    expect(run.trigger).toBe("composer");
  });

  it("the mode reaches the compiler as representation density", () => {
    expect(densityForMode("short")).toBe("compact");
    expect(densityForMode("research")).toBe("standard");
    expect(densityForMode("full")).toBeNull();
    expect(readFileSync("lib/mesh/compiler.ts", "utf8")).toContain("densityForMode(input.answerMode)");
    expect(readFileSync("server/mesh/executor.ts", "utf8")).toContain("answerMode: ctx.answerMode");
  });
});

describe("UI-03 default: the profile's answer mode is used by a new request", () => {
  it("resolves request > profile > product default", () => {
    expect(resolveAnswerMode(null, null)).toBe(DEFAULT_ANSWER_MODE);
    expect(resolveAnswerMode({ answerMode: "short" }, null)).toBe("short");
    expect(resolveAnswerMode({ answerMode: "short" }, "research")).toBe("research");
  });

  it("a request without a mode takes the profile default", async () => {
    await executeAgentCommand(SESSION, { action: "setAnswerMode", specialty: "cardiology", answerMode: "research" });
    const { run } = await createAskRun(SESSION, "cardiology", "Дапаглифлозин при сердечной недостаточности");
    expect(run.input.answerMode).toBe("research");
  });
});

describe("UI-04 suggestions are queries, not modes", () => {
  it("renders queries in a row of their own with no radio semantics", () => {
    const items = homeSuggestions("cardiology", ["hf"]);
    const html = renderToStaticMarkup(<Suggestions items={items} onPick={() => undefined} />);
    expect(html).toContain('data-kind="query"');
    expect(html.match(/data-suggestion/g)?.length).toBe(items.length);
    expect(html).not.toContain('role="radio"');
    expect(items).toContain("Что нового по теме «ХСН»");
    for (const item of items) for (const mode of ANSWER_MODES) expect(item).not.toBe(ANSWER_MODE_COPY[mode].label);
  });
});

describe("UI-05 quick agents launch jobs, never change the mode", () => {
  it("three job links, each to the routed job, no mode in the link", () => {
    const cards = quickAgentCards("cardiology");
    expect(cards.map(card => card.job)).toEqual(["drug", "guidelines", "research"]);
    for (const card of cards) {
      expect(card.href).toBe(`/cardiology/ask?job=${card.job}`);
      expect(card.href).not.toMatch(/mode/u);
    }
    const html = renderToStaticMarkup(<QuickAgents specialty="cardiology" />);
    expect(html.match(/class="pt-shortcut"/g)?.length).toBe(3);
    expect(html).not.toContain('role="radio"');
    expect(html).not.toContain("answerMode");
    // «research» names both a job family and a depth: the shell keeps them on different controls.
    expect((PORTAL_JOBS as readonly string[]).includes("research")).toBe(true);
    expect(ANSWER_MODES).toContain("research");
  });
});

describe("UI-06 profile: specialty, topics and source preferences persist", () => {
  it("identity, mode and interests survive a reload of the stored profile", async () => {
    await executeAgentCommand(SESSION, { action: "setProfileIdentity", specialty: "cardiology", name: "Василий Иванов", workplace: "ГКБ №52", experienceYears: 12 });
    await executeAgentCommand(SESSION, { action: "setAnswerMode", specialty: "cardiology", answerMode: "short" });
    await executeAgentCommand(SESSION, { action: "setInterests", specialty: "cardiology", topics: ["hf", "af"], trustedSources: ["rko", "pubmed"], excludedSources: ["nejm"], runAgents: false });
    const profile = await loadProfile(SESSION, "cardiology");
    expect(profile.identity).toEqual({ name: "Василий Иванов", workplace: "ГКБ №52", experienceYears: 12 });
    expect(profile.answerMode).toBe("short");
    expect(profile.interests).toEqual({ topics: ["hf", "af"], trustedSources: ["rko", "pubmed"], excludedSources: ["nejm"] });
    // What the store persisted is what a fresh load normalises to.
    const stored = JSON.parse(JSON.stringify(await workspaceStore().getProfile(SESSION, "cardiology")));
    expect(normalizeProfile(stored, "cardiology")).toMatchObject({ identity: profile.identity, answerMode: "short", interests: profile.interests });
  });

  it("an older profile without the new fields normalises to the defaults", () => {
    const legacy = { ...defaultProfile("cardiology") } as Record<string, unknown>;
    delete legacy.answerMode;
    delete legacy.identity;
    const profile = normalizeProfile(legacy as never, "cardiology");
    expect(profile.answerMode).toBe(DEFAULT_ANSWER_MODE);
    expect(profile.identity).toEqual({ name: null, workplace: null, experienceYears: null });
  });
});

describe("UI-07 materials keep their add / search / filter contracts", () => {
  it("renders the toolbar, the ask form, sorting, filters and the library", () => {
    const html = render(<MaterialsWorkspace specialty="cardiology" materials={[material()]} collections={[]} lastAnswer={null} answerResults={[]} examples={[]} now="2026-10-22T10:00:00.000Z" />);
    for (const text of ["Загрузить файл", "Добавить ссылку", "Написать заметку", "Спросить по моим материалам", 'aria-label="Сортировка"', 'aria-label="Формат"', 'aria-label="Подборка"', "Разбор SCORE2"]) expect(html).toContain(text);
    expect(html.match(/class="ws-material"/g)?.length).toBe(1);
  });
});

describe("UI-08 the de-identification tool is separate from materials", () => {
  it("materials never render the anonymizer workflow and the reverse", () => {
    const materials = render(<MaterialsWorkspace specialty="cardiology" materials={[material()]} collections={[]} lastAnswer={null} answerResults={[]} examples={[]} now="2026-10-22T10:00:00.000Z" />);
    expect(materials).not.toContain('role="tablist"');
    expect(materials).not.toContain("Обезличивание");
    const tool = renderToStaticMarkup(<AnonymizerTool specialty="cardiology" />);
    expect(tool).toContain('role="tablist"');
    for (const tab of ["Обработка", "История", "Статистика", "Настройки"]) expect(tool).toContain(tab);
    expect(tool).not.toContain("ws-material");
    expect(tool).not.toContain("Мои материалы");
    expect(readFileSync("app/[specialty]/(workspace)/anonymizer/page.tsx", "utf8")).not.toContain("MaterialsWorkspace");
    expect(readFileSync("app/[specialty]/(workspace)/materials/page.tsx", "utf8")).not.toContain("AnonymizerTool");
  });

  it("the tool uses the same rules as the server, with per-rule counts", () => {
    const result = redactDirectIdentifiers("Пациент: Иванов Иван. Телефон +7 999 123-45-67, почта ivanov@example.com", { rules: ["phone", "email"] });
    expect(result.counts).toEqual({ phone: 1, email: 1 });
    expect(result.rulesApplied).toEqual(["email", "phone"]);
    expect(result.redactedText).toContain("[PHONE]");
    expect(result.redactedText).toContain("Иванов");
    expect(redactDirectIdentifiers("Пациент: Иванов Иван").redactedText).toContain("ФИО: [REDACTED]");
  });
});

describe("UI-09 mascot accessibility and motion", () => {
  it("is decorative, one character for every role, quiet under reduced motion", () => {
    const base = renderToStaticMarkup(<Mascot variant="canonical" />);
    expect(base).toContain('aria-hidden="true"');
    expect(base).toContain('role="presentation"');
    expect(base).toContain('focusable="false"');
    const body = base.match(/class="sm-body"[^>]*d="([^"]+)"/u)?.[1];
    expect(body).toBeTruthy();
    for (const variant of ["drug", "guidelines", "research", "events", "materials"] as const) {
      const html = renderToStaticMarkup(<Mascot variant={variant} />);
      expect(html.match(/class="sm-body"[^>]*d="([^"]+)"/u)?.[1]).toBe(body);
      expect(html).toContain("sm-prop-group");
      expect(html).not.toContain("mc-body");
    }
    expect(shellCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mascot \.sm-figure,\s*\.mascot \.sm-prop-group \{ animation: none !important; \}/u);
    expect(tokensCss).toMatch(/--ws-mascot-tilt: 1\.5deg;/u);
    expect(tokensCss).toMatch(/--ws-mascot-lift: 2px;/u);
  });
});

describe("UI-10 media geometry", () => {
  it("feed media is 2:1, open material is 3:1, and every derivative image declares its size", () => {
    expect(tokensCss).toContain("--ws-media-feed-ratio: 2 / 1;");
    expect(tokensCss).toContain("--ws-media-article-ratio: 3 / 1;");
    expect(shellCss).toMatch(/\.pt-card-media img,\s*\.pt-card-media \.ws-feed-art \{[^}]*aspect-ratio: var\(--ws-media-feed-ratio\);[^}]*object-fit: cover;/u);
    expect(shellCss).toMatch(/\.pt-item-hero img,\s*\.pt-item-hero \.ws-feed-art \{[^}]*aspect-ratio: var\(--ws-media-article-ratio\);[^}]*object-fit: cover;/u);
    const derivative = approvedDerivatives()[0];
    const html = renderToStaticMarkup(<CardMediaView media={{ kind: "derivative", derivativeId: derivative.id, src: derivative.src as string, alt: derivative.alt, credit: derivative.label, caveat: null }} />);
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="800"');
  });
});

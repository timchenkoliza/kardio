import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology/materials/x",
  useSearchParams: () => new URLSearchParams(),
}));
import { MaterialReader } from "@/components/workspace/material-reader";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { fragmentSearchTerms, paragraphsOf, relatedPassages } from "@/lib/materials/fragments";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { materialFromNote } from "@/server/agents/services/material";

/**
 * B2 «Вопрос к фрагменту материала» (docs/CAPABILITY_COVERAGE_MATRIX.md,
 * materials.fragment_question): places in the same document and in the
 * physician's other materials; a search by sources receives only recognised
 * medical terms, never the fragment's text.
 */

const OWNER = "7".repeat(64);
const OTHER = "8".repeat(64);
const NOTE = "Разбор ХСН с сохранённой фракцией выброса.\n\nЭмпаглифлозин снижал число госпитализаций по поводу сердечной недостаточности.\n\nФуросемид — при застое.\n\nГоспитализации по поводу сердечной недостаточности — главная конечная точка.";

describe("fragments of the physician's own document", () => {
  it("numbers paragraphs and finds the other places that say the same thing", () => {
    const paragraphs = paragraphsOf(NOTE);
    expect(paragraphs.map(item => item.number)).toEqual([1, 2, 3, 4]);
    const hits = relatedPassages(paragraphs, paragraphs[1]!.text, { exclude: 2 });
    expect(hits.map(hit => hit.number)).toEqual([4]);
    expect(hits[0]!.matched).toEqual(expect.arrayContaining(["госпитализаций", "сердечной", "недостаточности"]));
  });

  it("a search by sources receives recognised medical terms only — no names, numbers or other words", () => {
    const terms = fragmentSearchTerms("Пациент Иванов И. И., 67 лет: эмпаглифлозин 10 мг при ХСН, наблюдается в поликлинике № 5", "cardiology");
    expect(terms).toContain("эмпаглифлозин");
    expect(terms.join(" ")).not.toMatch(/иванов|67|10 мг|поликлиник|№/iu);
    expect(fragmentSearchTerms("Позвонить в регистратуру во вторник", "cardiology")).toEqual([]);
  });
});

describe("fragmentLookup", () => {
  it("searches only the owner's other materials and refuses a material of another session", async () => {
    delete process.env.DATABASE_URL;
    const store = workspaceStore();
    const now = "2026-10-24T10:00:00.000Z";
    const opened = materialFromNote({ specialty: "cardiology", title: "Разбор ХСНсФВ", note: NOTE, now });
    const related = materialFromNote({ specialty: "cardiology", title: "Конспект: госпитализации при сердечной недостаточности", note: "Госпитализации по поводу сердечной недостаточности снижались на фоне иНГЛТ-2.", now });
    const foreign = materialFromNote({ specialty: "cardiology", title: "Чужой конспект о сердечной недостаточности", note: "Госпитализации по поводу сердечной недостаточности.", now });
    await store.saveMaterial(OWNER, opened);
    await store.saveMaterial(OWNER, related);
    await store.saveMaterial(OTHER, foreign);

    const fragment = "Эмпаглифлозин снижал число госпитализаций по поводу сердечной недостаточности.";
    const response = await executeAgentCommand(OWNER, { action: "fragmentLookup", specialty: "cardiology", materialId: opened.id, fragment });
    expect(response.fragment!.related.map(hit => hit.materialId)).toEqual([related.id]);
    expect(response.fragment!.searchTerms).toContain("эмпаглифлозин");
    await expect(executeAgentCommand(OTHER, { action: "fragmentLookup", specialty: "cardiology", materialId: opened.id, fragment })).rejects.toMatchObject({ status: 404 });
    // A fragment is bounded: a whole document is never accepted.
    expect(agentCommandSchema.safeParse({ action: "fragmentLookup", specialty: "cardiology", materialId: opened.id, fragment: "а".repeat(601) }).success).toBe(false);
  });
});

describe("the reader", () => {
  it("shows numbered paragraphs with an accessible «Спросить об абзаце» on each", () => {
    const html = renderToStaticMarkup(<WorkspaceProvider specialty="cardiology"><MaterialReader specialty="cardiology" materialId="m" paragraphs={paragraphsOf(NOTE)} /></WorkspaceProvider>);
    expect(html).toContain('id="p-2"');
    expect(html).toContain('aria-label="Спросить об абзаце 4"');
  });
});

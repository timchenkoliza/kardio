import { SPECIALTY_CALCULATORS } from "@/lib/calculators/catalog";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentResult, Material } from "@/lib/agents/types";
import { LAUNCH_SPECIALTY_IDS, type SpecialtyId } from "@/lib/domain/types";
import { GALLERY, galleryHref } from "@/lib/portal/agents-gallery";
import { materialExamples } from "@/lib/portal/material-examples";
import { filterMaterials, materialFormat, russianIsoDate, sortMaterials } from "@/lib/portal/materials";
import { showcaseFor, SHOWCASE } from "@/lib/portal/showcase";
import { containsInternalJargon, hasEnglishProse, isRussian } from "@/lib/presentation/physician";
import { buildForYou, itemHref, resultCard } from "@/server/portal/for-you";
import { listContent } from "@/server/repositories/catalog";
import { FIXED_NOW } from "./agent-test-utils";

/**
 * Physician-facing product surface: every launch specialty has a non-empty,
 * Russian, clickable feed without another specialty's content; the gallery
 * launches jobs in the same tab; materials sort and filter deterministically.
 */

const CARDIOLOGY_CLINICAL = /РКО|\bESC\b|\bAHA\b|EACVI|EAPCI|Люмен Фарма|кардио/iu;

function pubmedResult(partial: Partial<AgentResult> & Pick<AgentResult, "id" | "title">): AgentResult {
  return {
    key: partial.id, specialty: "neurology", runId: "run-1", agentId: "guidelines", kind: "guideline_change", category: "guideline_publication", summary: "Клинические рекомендации · Stroke · 2026 Oct",
    reasonShown: ["Новая публикация по специальности «Неврология»"], createdAt: "2026-10-19T10:00:00.000Z", observedAt: "2026-10-01", evidence: [],
    source: { connectorId: "pubmed", source: "Stroke", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/", publisher: "Stroke", retrievedAt: "2026-10-19T10:00:00.000Z", publishedAt: null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    actions: [{ kind: "open_source", label: "PubMed", href: "https://pubmed.ncbi.nlm.nih.gov/1/", requiresConfirmation: false }],
    attributes: { journal: "Stroke", studyType: "Клинические рекомендации" }, partner: null, dismissed: false, savedMaterialId: null, rank: 1, ...partial,
  };
}

describe("«Для вас» in every launch specialty", () => {
  it.each(LAUNCH_SPECIALTY_IDS.filter(id => id !== "cardiology"))("%s: a non-empty editorial selection, Russian, without cardiology", async specialty => {
    const view = buildForYou({ specialty, profile: defaultProfile(specialty), results: [], runs: [], materials: [], content: await listContent("cardiology"), now: FIXED_NOW });
    expect(view.cards.length).toBeGreaterThanOrEqual(3);
    for (const card of view.cards) {
      expect(card.showcase).toBe(true);
      expect(card.trust.label).toBe("Подборка редакции");
      expect(card.href).toMatch(new RegExp(`^/${specialty}/item/sc-`, "u"));
      expect(card.source.url).toMatch(/^https:\/\//u);
      expect(isRussian(card.title)).toBe(true);
      expect(hasEnglishProse(`${card.title} ${card.summary ?? ""} ${card.whyItMatters ?? ""}`)).toBe(false);
      expect(`${card.title} ${card.summary} ${card.tags.join(" ")} ${card.source.name}`).not.toMatch(CARDIOLOGY_CLINICAL);
      // UX-09: no card action pretends to act on the material while starting a new search.
      expect(card.scenarios.map(item => item.label)).toEqual(["Исследования по теме", "Рекомендации по теме"]);
    }
  });

  it("the editorial selection never crosses specialties and has real links", () => {
    expect(SHOWCASE.some(item => item.specialty === "cardiology")).toBe(false);
    for (const specialty of LAUNCH_SPECIALTY_IDS as readonly SpecialtyId[]) {
      for (const item of showcaseFor(specialty)) {
        expect(item.specialty).toBe(specialty);
        expect(item.url).toMatch(/^https:\/\/(?:doi\.org\/10\.|www\.|[a-z]+\.[a-z.]+\/)/u);
        expect(isRussian(item.title)).toBe(true);
      }
    }
  });

  it("a live English publication becomes a Russian card that opens inside the product", () => {
    const result = pubmedResult({ id: "res-00000000-0000-4000-8000-000000000001", title: "2026 Guideline for Adult Stroke Rehabilitation and Recovery: A Guideline From the American Heart Association and American Stroke Association." });
    const card = resultCard(result, "neurology", false);
    expect(card.title).toBe("Рекомендации 2026: инсульт — реабилитация и восстановление у взрослых");
    expect(card.summary).toBe("Документ: Американская ассоциация сердца, Американская ассоциация инсульта. Опубликовано в журнале Stroke.");
    expect(card.original?.title).toBe(result.title);
    expect(card.href).toBe(itemHref("neurology", result.id));
    expect(card.primary).toMatchObject({ href: card.href, external: false });
    expect(card.source.url).toBe("https://pubmed.ncbi.nlm.nih.gov/1/");
    expect(card.trust.label).toBe("Надёжный источник");
    // Stroke in general: the approved derivative of an occluded cerebral artery, labelled as a topic illustration.
    expect(card.media).toMatchObject({ kind: "derivative", caveat: "Иллюстрация к теме, не к конкретному случаю" });
    expect(card.media?.kind === "derivative" && card.media.derivativeId).toMatch(/^drv-neurology-ischemic-stroke-/u);
    for (const text of [card.title, card.summary ?? "", card.whyShown, card.whyItMatters ?? "", card.trust.label]) expect(containsInternalJargon(text)).toBe(false);
    expect(`${card.title} ${card.summary}`).not.toMatch(/\bAHA\b/u);
  });
});

describe("agent gallery", () => {
  it("launches each available agent in the same tab, never as an external link", () => {
    // «Консилиум» was the same answer job under another name (UX-02, A-08): one task, one name.
    expect(GALLERY.map(agent => agent.id)).toEqual(["drug", "guidelines", "research", "calculators", "events", "materials", "learning", "updates"]);
    // «Что нового» is the check that fills «Для вас», with its settings — not a second, separate page.
    expect(galleryHref(GALLERY.find(agent => agent.id === "updates")!, "therapy")).toBe("/therapy/agents/whats-new");
    expect(galleryHref(GALLERY.find(agent => agent.id === "drug")!, "neurology")).toBe("/neurology/ask?job=drug");
    expect(galleryHref(GALLERY.find(agent => agent.id === "materials")!, "therapy")).toBe("/therapy/materials");
    expect(galleryHref(GALLERY.find(agent => agent.id === "calculators")!, "cardiology")).toBe("/cardiology/tools");
    // Every specialty has its own calculators (B15); cardiology risk scores lead only in cardiology.
    expect(galleryHref(GALLERY.find(agent => agent.id === "calculators")!, "neurology")).toBe("/neurology/tools");
    expect(SPECIALTY_CALCULATORS.neurology[0]).toBe("gcs");
    expect(SPECIALTY_CALCULATORS.pediatrics).not.toContain("cha2ds2va");
    expect(SPECIALTY_CALCULATORS.cardiology[0]).toBe("cha2ds2va");
    for (const agent of GALLERY) expect(`${agent.name} ${agent.can} ${agent.sources} ${agent.help}`).not.toMatch(CARDIOLOGY_CLINICAL);
  });
});

describe("«Мои материалы»", () => {
  const base: Omit<Material, "id" | "kind" | "title" | "createdAt" | "provenance"> = { specialty: "neurology", ownership: "PUBLIC_SOURCE", url: null, note: null, fileName: null, mimeType: null, sizeBytes: null, text: null, textChars: 0, parseStatus: "metadata_only", parseNote: null, redactions: [], sourceResultId: null, sourceAgentId: null, collectionIds: [] };
  const materials: Material[] = [
    { ...base, id: "m1", kind: "link", title: "B", createdAt: "2026-10-01T00:00:00.000Z", format: "study", provenance: { connectorId: "user-uploads", source: "PubMed", sourceUrl: null, publisher: null, retrievedAt: "", publishedAt: "2024-05", version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "user_content" }, collectionIds: ["c1"] },
    { ...base, id: "m2", kind: "note", ownership: "USER_UPLOADED", title: "A", createdAt: "2026-10-03T00:00:00.000Z", provenance: null },
    { ...base, id: "m3", kind: "link", title: "C", createdAt: "2026-10-02T00:00:00.000Z", format: "guideline", provenance: { connectorId: "user-uploads", source: "DOI", sourceUrl: null, publisher: null, retrievedAt: "", publishedAt: "2025-01-10", version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "user_content" } },
  ];

  it("sorts by newest, added date, publication date and format", () => {
    expect(sortMaterials(materials, "newest").map(item => item.id)).toEqual(["m2", "m3", "m1"]);
    expect(sortMaterials(materials, "added").map(item => item.id)).toEqual(["m1", "m3", "m2"]);
    expect(sortMaterials(materials, "published").map(item => item.id)).toEqual(["m3", "m1", "m2"]);
    expect(sortMaterials(materials, "format").map(item => item.id)).toEqual(["m3", "m1", "m2"]);
    expect(materialFormat(materials[1])).toBe("note");
  });

  it("filters by format, ownership and collection", () => {
    expect(filterMaterials(materials, { format: "guideline", ownership: "all", collection: "all" }).map(item => item.id)).toEqual(["m3"]);
    expect(filterMaterials(materials, { format: "all", ownership: "USER_UPLOADED", collection: "all" }).map(item => item.id)).toEqual(["m2"]);
    expect(filterMaterials(materials, { format: "all", ownership: "all", collection: "c1" }).map(item => item.id)).toEqual(["m1"]);
    expect(russianIsoDate("2025-01-10")).toBe("10 янв. 2025 г.");
    expect(russianIsoDate("2024-05")).toBe("мая 2024 г.");
  });

  it("examples come from the same specialty and link to real documents", () => {
    for (const specialty of LAUNCH_SPECIALTY_IDS as readonly SpecialtyId[]) {
      const examples = materialExamples(specialty);
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(example.url).toMatch(/^https:\/\//u);
        if (specialty !== "cardiology") expect(`${example.title} ${example.summary} ${example.publisher}`).not.toMatch(CARDIOLOGY_CLINICAL);
      }
    }
  });
});

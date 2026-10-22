import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CardMediaView, renderableMedia } from "@/components/portal/for-you";
import { defaultProfile } from "@/lib/agents/profile";
import { LAUNCH_SPECIALTY_IDS, type ContentObject, type SpecialtyId } from "@/lib/domain/types";
import { approvedDerivatives, MEDIA_MANIFEST, publishableDerivative, selectCardMedia } from "@/lib/media/derivatives";
import { MEDIA_FRAME, MEDIA_PALETTE, MEDIA_PIPELINE, MEDIA_STYLE, MEDIA_TRANSFORMATION_VERSION, MEDIUM_CAVEAT } from "@/lib/media/style";
import { subjectFor } from "@/lib/media/subjects";
import type { MediaDerivative, MediaManifest, MediaSource, MediaSourcePassport, MediaSourceRegistry } from "@/lib/media/types";
import type { CardMedia, ForYouCard } from "@/lib/portal/cards";
import { SHOWCASE } from "@/lib/portal/showcase";
import { loadGoldenSet, normalizeGoldenSet } from "@/server/ingestion/goldenset";
import { decode, eligibilityChecks, transformSource, validateDerivative } from "@/server/media/style-pipeline";
import { buildForYou, catalogCard, resultCard, showcaseCard } from "@/server/portal/for-you";
import { FIXED_NOW } from "./agent-test-utils";

/**
 * Medical media contract (MEDIA-01…08): a physician-facing card shows an
 * approved design-system derivative of a matched source image, in-house art,
 * or nothing — never the source image itself, never a rejected transformation.
 */

const root = process.cwd();
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const registry = JSON.parse(await readFile(join(root, "data/media-sources.json"), "utf8")) as MediaSourceRegistry;
const sourceFiles = new Set(registry.sources.map(item => item.file));
const attempts = new Set(MEDIA_MANIFEST.derivatives.map(item => item.attemptSrc).filter(Boolean));
const approved = approvedDerivatives();
const { content: goldenSet } = normalizeGoldenSet(await loadGoldenSet(root));
const anchorText = (id: string) => {
  const showcase = SHOWCASE.find(item => item.id === id);
  if (showcase) return { text: [showcase.title, showcase.summary, ...showcase.tags, showcase.topic].join(" "), kind: showcase.kind };
  const content = goldenSet.find(item => item.id === id);
  return content ? { text: [content.title, content.summary, ...content.tags, ...content.topics].join(" "), kind: content.kind } : null;
};

function feedCards(): Array<{ specialty: SpecialtyId; card: ForYouCard }> {
  return LAUNCH_SPECIALTY_IDS.flatMap(specialty => {
    const view = buildForYou({ specialty, profile: defaultProfile(specialty), results: [], runs: [], materials: [], content: goldenSet, now: FIXED_NOW });
    return view.cards.map(card => ({ specialty: specialty as SpecialtyId, card }));
  });
}

function rawCatalogItem(): ContentObject {
  // A golden-set guideline whose own asset is a publishable source image: the case the old feed rendered as is.
  const base = goldenSet.find(item => item.id === "gl-af-export") as ContentObject;
  return { ...base, asset: { id: "image-gl-af-export", url: "/media/cardiology/ecg-atrial-fibrillation.webp", sourceUrl: null, credit: "source", caption: "raw", status: "verified", rights: "publishable", semanticMatch: "clinical", width: 1190, height: 595 } };
}

function stroke(text: string, used?: Set<string>, manifest: MediaManifest = MEDIA_MANIFEST) {
  return selectCardMedia({ specialty: "neurology", text, used }, manifest);
}

describe("MEDIA-01 a source image never reaches a card", () => {
  it("cards of every launch specialty carry only approved derivatives or in-house art", () => {
    const cards = feedCards();
    expect(cards.length).toBeGreaterThan(18);
    for (const { specialty, card } of cards) {
      if (!card.media) continue;
      expect(["derivative", "art"]).toContain(card.media.kind);
      if (card.media.kind !== "derivative") continue;
      expect(card.media.src).toMatch(/^\/media\/derived\//u);
      expect(sourceFiles.has(card.media.src)).toBe(false);
      expect(attempts.has(card.media.src)).toBe(false);
      expect(publishableDerivative(card.media, specialty)).not.toBeNull();
    }
    expect(cards.some(({ card }) => card.media?.kind === "derivative")).toBe(true);
  });

  it("a catalog document's own publishable asset is not used as its card picture", () => {
    const card = catalogCard(rawCatalogItem(), "cardiology", []);
    expect(card.media?.kind).toBe("derivative");
    expect(card.media?.kind === "derivative" && card.media.src).not.toBe("/media/cardiology/ecg-atrial-fibrillation.webp");
    expect(card.media?.kind === "derivative" && card.media.derivativeId).toMatch(/^drv-cardiology-atrial-fibrillation-/u);
  });

  it("a live cardiology result gets the derivative of its subject, not the licensed source crop", () => {
    const result = { key: "r", id: "res-00000000-0000-4000-8000-000000000002", specialty: "cardiology", runId: "run-1", agentId: "whats_new", kind: "update", category: "publication", title: "Антикоагулянтная терапия при фибрилляции предсердий у пожилых", summary: "Обзор", reasonShown: [], createdAt: "2026-10-19T10:00:00.000Z", observedAt: "2026-10-01", evidence: [], source: { connectorId: "pubmed", source: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/2/", publisher: "PubMed", retrievedAt: "2026-10-19T10:00:00.000Z", publishedAt: null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" }, actions: [], attributes: {}, partner: null, dismissed: false, savedMaterialId: null, rank: 1 } as unknown as Parameters<typeof resultCard>[0];
    const card = resultCard(result, "cardiology", false);
    expect(card.media).toMatchObject({ kind: "derivative" });
    expect(card.media?.kind === "derivative" && card.media.src.startsWith("/media/cardiology/")).toBe(false);
  });
});

describe("MEDIA-02 a published derivative traces back to its source image and document", () => {
  it.each(approved.map(item => [item.id, item] as const))("%s", async (_id, derivative) => {
    const source = registry.sources.find(item => item.id === derivative.source.id) as MediaSource;
    expect(source).toBeDefined();
    expect(derivative.source.url).toBe(source.origin.url);
    expect(derivative.source.url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
    expect(sha256(await readFile(join(root, "public", source.file)))).toBe(derivative.source.sha256);
    expect(derivative.document.id).toBe(source.document.id);
    expect(anchorText(derivative.document.id)).not.toBeNull();
    const file = await readFile(join(root, "public", derivative.src as string));
    expect(sha256(file)).toBe(derivative.sha256);
    expect(derivative.label).toContain(source.credit);
    expect(Date.parse(derivative.createdAt)).not.toBeNaN();
  });

  it("source and derivative are different entities and files", () => {
    for (const derivative of approved) {
      expect(derivative.src).not.toBe(derivative.source.file);
      expect(derivative.id).not.toBe(derivative.source.id);
    }
  });
});

describe("MEDIA-03 the derivative shows the card's clinical object", () => {
  it("every derivative's anchor document names the same object", () => {
    for (const derivative of MEDIA_MANIFEST.derivatives) {
      const anchor = anchorText(derivative.document.id);
      const check = derivative.validation.checks.find(item => item.id === "anchor_subject");
      expect(check?.pass, derivative.id).toBe(subjectFor(derivative.specialty, anchor?.text ?? "", anchor?.kind)?.subject === derivative.subject);
      if (derivative.status === "approved") expect(check?.pass, derivative.id).toBe(true);
    }
  });

  it("cards show derivatives of their own subject and specialty", () => {
    for (const { specialty, card } of feedCards()) {
      const derivative = publishableDerivative(card.media);
      if (!derivative) continue;
      const kind = card.kind === "catalog" || card.kind === "guideline" ? "guideline" : null;
      const subject = subjectFor(specialty, [card.title, card.summary, ...card.tags, card.topic ?? "", card.original?.title ?? ""].join(" "), kind)?.subject;
      expect(derivative.specialty).toBe(specialty);
      expect(derivative.subject, card.id).toBe(subject);
    }
  });

  it("aortic regurgitation is a valve topic, never coronary disease", () => {
    const media = selectCardMedia({ specialty: "cardiology", text: "Аортальная недостаточность", kind: "guideline" });
    expect(publishableDerivative(media)?.subject).toBe("heart_chambers_valves");
    expect(media?.kind === "derivative" && media.caveat).toBe(MEDIUM_CAVEAT);
    expect(subjectFor("cardiology", "Антиагрегантная терапия после стентирования")?.subject).toBe("coronary_artery_disease");
    expect(subjectFor("cardiology", "Антикоагулянты: новые данные")).toBeNull();
  });

  it("an unrelated topic gets no derivative", () => {
    expect(stroke("Мигрень: профилактика у взрослых")?.kind ?? null).not.toBe("derivative");
  });
});

describe("MEDIA-04 a failed transformation falls back, never to the raw image", () => {
  const strokeDerivative = approved.find(item => item.subject === "ischemic_stroke") as MediaDerivative;
  const rejectedOnly: MediaManifest = {
    ...MEDIA_MANIFEST,
    derivatives: MEDIA_MANIFEST.derivatives.map(item => item.id === strokeDerivative.id ? { ...item, status: "rejected", src: null, attemptSrc: item.src, validation: { ...item.validation, status: "failed", failureReason: "test" } } : item),
  };

  it("falls back to in-house art of the same object, then to no picture", () => {
    expect(stroke("Тромболизис при ишемическом инсульте", undefined, rejectedOnly)).toEqual({ kind: "art", art: "stroke", alt: expect.stringMatching(/^Схема /u), animated: false });
    expect(stroke("Тромболизис при ишемическом инсульте", new Set(["stroke"]), rejectedOnly)).toBeNull();
  });

  it("the renderer refuses a rejected attempt and the stored source image", () => {
    for (const src of [strokeDerivative.src as string, strokeDerivative.source.file]) {
      const forged: CardMedia = { kind: "derivative", derivativeId: strokeDerivative.id, src, alt: "", credit: "", caveat: null };
      const manifest = src === strokeDerivative.src ? rejectedOnly : MEDIA_MANIFEST;
      expect(publishableDerivative(forged, "neurology", manifest)).toBeNull();
    }
    const raw: CardMedia = { kind: "derivative", derivativeId: strokeDerivative.id, src: strokeDerivative.source.file, alt: "", credit: "", caveat: null };
    expect(renderToStaticMarkup(<CardMediaView media={raw} />)).toBe("");
    expect(renderableMedia(raw)).toBeNull();
  });

  it("every rejected record states why and what a card shows instead", () => {
    for (const derivative of MEDIA_MANIFEST.derivatives.filter(item => item.status === "rejected")) {
      expect(derivative.src).toBeNull();
      expect(derivative.validation.failureReason).toBeTruthy();
      if (derivative.fallback.kind === "derivative") {
        const sibling = approved.find(item => item.id === derivative.fallback.ref);
        expect(sibling?.subject).toBe(derivative.subject);
        expect(sibling?.specialty).toBe(derivative.specialty);
      } else if (derivative.fallback.kind === "art") expect(derivative.fallback.ref).toBeTruthy();
    }
    expect(MEDIA_MANIFEST.derivatives.some(item => item.status === "rejected")).toBe(true);
  });
});

describe("MEDIA-05 neighbours do not repeat one derivative while an alternative exists", () => {
  it("two coronary cards take the two coronary derivatives, the third falls back to art", () => {
    const used = new Set<string>();
    const text = "Стабильная ишемическая болезнь сердца: реваскуляризация и ЧКВ";
    const first = selectCardMedia({ specialty: "cardiology", text, used });
    const second = selectCardMedia({ specialty: "cardiology", text, used });
    const third = selectCardMedia({ specialty: "cardiology", text, used });
    expect(first?.kind).toBe("derivative");
    expect(second?.kind).toBe("derivative");
    expect(first?.kind === "derivative" && second?.kind === "derivative" && first.derivativeId !== second.derivativeId).toBe(true);
    expect(third?.kind).toBe("art");
  });

  it("no picture appears twice in a feed", () => {
    for (const specialty of LAUNCH_SPECIALTY_IDS) {
      const keys = feedCards().filter(item => item.specialty === specialty).map(({ card }) => card.media?.kind === "derivative" ? card.media.derivativeId : card.media?.kind === "art" ? card.media.art : null).filter(Boolean);
      expect(new Set(keys).size, specialty).toBe(keys.length);
    }
  });
});

describe("MEDIA-06 no specialty receives another specialty's media", () => {
  it("cardiology words on a neurology card select nothing from cardiology", () => {
    const media = selectCardMedia({ specialty: "neurology", text: "Фибрилляция предсердий и ЧКВ: кардиоэмболический инсульт" });
    const derivative = publishableDerivative(media);
    if (derivative) expect(derivative.specialty).toBe("neurology");
    const cardiac = approved.find(item => item.specialty === "cardiology") as MediaDerivative;
    const borrowed: CardMedia = { kind: "derivative", derivativeId: cardiac.id, src: cardiac.src as string, alt: "", credit: "", caveat: null };
    expect(publishableDerivative(borrowed, "neurology")).toBeNull();
  });

  it("the editorial selection of every non-cardiology specialty has its own derivatives", () => {
    for (const specialty of LAUNCH_SPECIALTY_IDS.filter(id => id !== "cardiology")) {
      const own = SHOWCASE.filter(item => item.specialty === specialty).map(item => showcaseCard(item)).map(card => publishableDerivative(card.media)).filter(Boolean);
      expect(own.length, specialty).toBeGreaterThanOrEqual(2);
      for (const derivative of own) expect(derivative?.specialty).toBe(specialty);
    }
  });
});

describe("MEDIA-07 the renderer tells an approved derivative from anything else", () => {
  const derivative = approved[0];
  it("draws an approved derivative with its id, pipeline version and attribution", () => {
    const html = renderToStaticMarkup(<CardMediaView media={{ kind: "derivative", derivativeId: derivative.id, src: derivative.src as string, alt: derivative.alt, credit: derivative.label, caveat: MEDIUM_CAVEAT }} />);
    expect(html).toContain('data-media="derivative"');
    expect(html).toContain(`data-derivative-id="${derivative.id}"`);
    expect(html).toContain(`data-pipeline="${MEDIA_TRANSFORMATION_VERSION}"`);
    expect(html).toContain(`src="${derivative.src}"`);
    expect(html).toContain(MEDIUM_CAVEAT);
  });

  it("draws nothing for an unknown id or a mismatched file", () => {
    expect(renderToStaticMarkup(<CardMediaView media={{ kind: "derivative", derivativeId: "drv-unknown", src: derivative.src as string, alt: "", credit: "", caveat: null }} />)).toBe("");
    expect(renderToStaticMarkup(<CardMediaView media={{ kind: "derivative", derivativeId: derivative.id, src: "/media/cardiology/heart-anatomy.webp", alt: "", credit: "", caveat: null }} />)).toBe("");
  });

  it("in-house art stays art", () => {
    expect(renderToStaticMarkup(<CardMediaView media={{ kind: "art", art: "brain", alt: "Схема головного мозга", animated: false }} />)).toContain('data-media="art"');
  });
});

describe("MEDIA-08 every derivative records its pipeline and design-system version", () => {
  it("manifest and records carry the current versions and a full validation", () => {
    expect(MEDIA_MANIFEST.pipeline).toEqual({ name: MEDIA_PIPELINE.name, version: MEDIA_TRANSFORMATION_VERSION });
    expect(MEDIA_MANIFEST.designSystem.version).toBe(MEDIA_STYLE.designSystemVersion);
    const required = ["match_gate", "patient_identifiers", "brand_marks", "diagnostic_background", "anchor_subject", "frame_2x1", "palette", "frame_background", "negative_space", "anchor_share", "brand_attention", "detail_level", "structure_precision", "structure_recall", "orientation"];
    for (const derivative of approved) {
      expect(derivative.transformation).toMatchObject({ pipeline: MEDIA_PIPELINE.name, version: MEDIA_TRANSFORMATION_VERSION, engine: "deterministic" });
      expect(derivative.designSystem).toEqual({ version: MEDIA_STYLE.designSystemVersion, palette: [...MEDIA_PALETTE] });
      expect(derivative.validation.checks.map(check => check.id)).toEqual(expect.arrayContaining(required));
      expect(derivative.validation.checks.every(check => check.pass)).toBe(true);
    }
  });

  it("every approved file is a 2:1 frame drawn only in the palette", async () => {
    const palette = new Set(MEDIA_PALETTE.map(hex => hex.toLowerCase()));
    for (const derivative of approved) {
      const raster = await decode(await readFile(join(root, "public", derivative.src as string)));
      expect([raster.width, raster.height]).toEqual([MEDIA_FRAME.width, MEDIA_FRAME.height]);
      const seen = new Set<string>();
      for (let i = 0; i < raster.data.length; i += 3 * 97) seen.add(`#${[raster.data[i], raster.data[i + 1], raster.data[i + 2]].map(value => value.toString(16).padStart(2, "0")).join("")}`);
      for (const color of seen) expect(palette.has(color), `${derivative.id} ${color}`).toBe(true);
    }
  });
});

describe("style transformation keeps the source geometry", () => {
  const passport: MediaSourcePassport = { crop: null, remove: [[340, 150, 50, 30]], keepText: [], hueSplit: false, brandMarks: false, patientIdentifiers: false, mustPreserve: [] };
  const synthetic = () => sharp({ create: { width: 400, height: 200, channels: 3, background: "#ffffff" } }).composite([
    { input: Buffer.from('<svg width="400" height="200"><circle cx="100" cy="100" r="80" fill="#1d3b8a"/><rect x="200" y="40" width="130" height="130" fill="#c0392b"/><rect x="340" y="150" width="50" height="30" fill="#000"/></svg>'), left: 0, top: 0 },
  ]).png().toBuffer();

  it("draws only palette colours, removes the label and keeps the shapes in place", async () => {
    const result = await transformSource(await synthetic(), passport);
    const checks = await validateDerivative(result, passport);
    expect(checks.filter(check => !check.pass)).toEqual([]);
    expect(result.params.render).toBe("tones");
  });

  it("a mirrored output fails the structure check: the side of a finding cannot change", async () => {
    const result = await transformSource(await synthetic(), passport);
    const mirrored = await sharp(result.output).flop().webp({ lossless: true }).toBuffer();
    const checks = await validateDerivative({ ...result, output: mirrored }, passport);
    const failed = checks.filter(check => !check.pass).map(check => check.id);
    expect(failed).toEqual(expect.arrayContaining(["structure_precision"]));
  });

  it("eligibility stops diagnostic images on a dark ground, brand marks and weak matches before any drawing", () => {
    const source = registry.sources.find(item => item.id === "src-cardiology-cardiac-mri") as MediaSource;
    expect(eligibilityChecks(source, 0.1).find(check => check.id === "diagnostic_background")?.pass).toBe(false);
    expect(eligibilityChecks({ ...source, sourceClass: "editorial" }, 0.1).find(check => check.id === "diagnostic_background")?.pass).toBe(true);
    expect(eligibilityChecks({ ...source, passport: { ...source.passport, brandMarks: true } }, 0.9).find(check => check.id === "brand_marks")?.pass).toBe(false);
    expect(eligibilityChecks({ ...source, match: { grade: "WEAK_PROXY", reason: "" } }, 0.9).find(check => check.id === "match_gate")?.pass).toBe(false);
  });
});

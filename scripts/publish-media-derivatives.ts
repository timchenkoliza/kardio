import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LAUNCH_SPECIALTY_IDS } from "@/lib/domain/types";
import { MEDIA_FRAME, MEDIA_PALETTE, MEDIA_PIPELINE, MEDIA_STYLE, MEDIA_TRANSFORMATION_VERSION } from "@/lib/media/style";
import { subjectFor } from "@/lib/media/subjects";
import type { FallbackRef, MediaDerivative, MediaManifest, MediaSourceRegistry, ValidationCheck } from "@/lib/media/types";
import { SHOWCASE } from "@/lib/portal/showcase";
import { decode, eligibilityChecks, failureReason, groundLuminanceOf, transformSource, validateDerivative } from "@/server/media/style-pipeline";
import { loadGoldenSet, normalizeGoldenSet } from "@/server/ingestion/goldenset";

/**
 * Publish step of the medical media pipeline. For every source in
 * data/media-sources.json: eligibility → anchor document check → style
 * transformation → validation of the encoded file → approved derivative in
 * public/media/derived + a record in data/media-derivatives.json. Rejected
 * sources keep their reason and the fallback a card shows instead.
 * The physician runtime only reads the manifest.
 *
 *   npm run media:publish
 */

const root = process.cwd();
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

const registry = JSON.parse(await readFile(join(root, "data/media-sources.json"), "utf8")) as MediaSourceRegistry;
const manifestPath = join(root, "data/media-derivatives.json");
const previous = await readFile(manifestPath, "utf8").then(text => JSON.parse(text) as MediaManifest).catch(() => null);
const createdAt = new Map(previous?.derivatives.map(item => [item.id, item.createdAt]) ?? []);

// Anchor documents: the editorial selection and the Cardiology Golden Set.
const { content } = normalizeGoldenSet(await loadGoldenSet(root));
const anchors = new Map<string, { text: string; kind: string | null }>([
  ...SHOWCASE.map(item => [item.id, { text: [item.title, item.summary, ...item.tags, item.topic].join(" "), kind: item.kind }] as const),
  ...content.map(item => [item.id, { text: [item.title, item.summary, ...item.tags, ...item.topics].join(" "), kind: item.kind }] as const),
]);

const derivedRoot = join(root, "public/media/derived");
await rm(derivedRoot, { recursive: true, force: true });

const derivatives: MediaDerivative[] = [];
for (const source of registry.sources) {
  const bytes = await readFile(join(root, "public", source.file));
  const storedSha = sha256(bytes);
  const stored = await decode(bytes);
  const id = `drv-${source.specialty}-${source.subject.replaceAll("_", "-")}-${sha256([storedSha, JSON.stringify(source.passport), MEDIA_TRANSFORMATION_VERSION, MEDIA_PALETTE.join(","), source.document.id].join("|")).slice(0, 10)}`;

  const anchor = anchors.get(source.document.id);
  const anchorSubject = anchor ? subjectFor(source.specialty, anchor.text, anchor.kind)?.subject ?? null : null;
  const checks: ValidationCheck[] = [
    ...eligibilityChecks(source, await groundLuminanceOf(bytes, source.passport.crop)),
    { id: "anchor_subject", pass: anchorSubject === source.subject, value: anchorSubject ?? (anchor ? "нет объекта" : "документ не найден"), threshold: source.subject },
  ];

  let src: string | null = null;
  let attemptSrc: string | null = null;
  let fileSha: string | null = null;
  let params: Record<string, number | string | boolean> = {};
  if (checks.every(check => check.pass)) {
    const result = await transformSource(bytes, source.passport);
    params = result.params;
    checks.push(...await validateDerivative(result, source.passport));
    const approved = checks.every(check => check.pass);
    const publicPath = `/media/derived/${source.specialty}/${approved ? "" : "attempt-"}${id}.webp`;
    await mkdir(dirname(join(root, "public", publicPath)), { recursive: true });
    await writeFile(join(root, "public", publicPath), result.output);
    fileSha = sha256(result.output);
    if (approved) src = publicPath;
    else attemptSrc = publicPath;
  }
  const approved = src !== null;
  derivatives.push({
    id,
    status: approved ? "approved" : "rejected",
    specialty: source.specialty,
    subject: source.subject,
    source: { id: source.id, file: source.file, url: source.origin.url, sha256: storedSha, width: stored.width, height: stored.height, credit: source.credit, license: source.license, crop: source.passport.crop, remove: source.passport.remove, keepText: source.passport.keepText },
    document: source.document,
    match: source.match,
    transformation: { pipeline: MEDIA_PIPELINE.name, version: MEDIA_TRANSFORMATION_VERSION, engine: "deterministic", params },
    designSystem: { version: MEDIA_STYLE.designSystemVersion, palette: [...MEDIA_PALETTE] },
    src,
    attemptSrc,
    sha256: fileSha,
    width: MEDIA_FRAME.width,
    height: MEDIA_FRAME.height,
    alt: source.alt,
    label: `Перерисовано по оригиналу: ${source.credit}`,
    validation: { status: approved ? "passed" : "failed", checks, failureReason: failureReason(checks) },
    fallback: { kind: "none", ref: null },
    createdAt: createdAt.get(id) ?? new Date().toISOString(),
  });
}

// What a card about the same clinical object shows when this derivative is not available.
for (const derivative of derivatives) {
  const sibling = derivatives.find(item => item !== derivative && item.status === "approved" && item.specialty === derivative.specialty && item.subject === derivative.subject);
  const anchor = anchors.get(derivative.document.id);
  const art = anchor ? subjectFor(derivative.specialty, anchor.text, anchor.kind)?.art ?? null : null;
  const fallback: FallbackRef = sibling ? { kind: "derivative", ref: sibling.id } : art ? { kind: "art", ref: art } : { kind: "none", ref: null };
  derivative.fallback = fallback;
}

const order = (specialty: string) => LAUNCH_SPECIALTY_IDS.indexOf(specialty as (typeof LAUNCH_SPECIALTY_IDS)[number]);
derivatives.sort((a, b) => order(a.specialty) - order(b.specialty));
const manifest: MediaManifest = {
  version: 1,
  pipeline: { name: MEDIA_PIPELINE.name, version: MEDIA_TRANSFORMATION_VERSION },
  designSystem: { version: MEDIA_STYLE.designSystemVersion, palette: [...MEDIA_PALETTE] },
  derivatives,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const item of derivatives) {
  const failed = item.validation.checks.filter(check => !check.pass).map(check => `${check.id}=${check.value}`).join(", ");
  console.log(`${item.status === "approved" ? "✓" : "✗"} ${item.id.padEnd(58)} ${failed || "все проверки пройдены"}${item.status === "rejected" ? ` → ${item.fallback.kind}:${item.fallback.ref ?? "—"}` : ""}`);
}
console.log(`\n${derivatives.filter(item => item.status === "approved").length}/${derivatives.length} approved · ${MEDIA_TRANSFORMATION_VERSION}`);

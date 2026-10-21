import { normalizeQuery } from "@/lib/portal/lexicon";
import type { ClaimKind, EvidenceGraph, GraphDocument } from "./evidence";
import type { EvidenceRequirement } from "./jobs";
import type { ExperienceManifest, ManifestView, ModuleFamily } from "./manifest";

/**
 * Result as context: a follow-up on an open result is first read as a
 * refinement of THAT result — an IntentDelta over its ExperienceContext —
 * before it is treated as a new question.
 *
 *   IntentDelta → affected requirements → graph nodes → modules → ExperiencePatch
 *
 * A refinement is answered from the evidence graph whenever the graph has
 * what it needs («только российские источники»); a source is called only for
 * what the graph lacks («сравни только дозировки» on a result without the
 * instruction's dosing section). The whole conversation is never replayed:
 * the context is a bounded set of references.
 */

export type IntentDeltaKind = "filter_jurisdiction" | "filter_since" | "fresh_since" | "focus" | "expand" | "version_delta" | "reset";

export interface IntentDelta {
  kind: IntentDeltaKind;
  params: Record<string, string | number | boolean | null>;
}

/** Bounded references the next action is resolved against — never the conversation itself. */
export interface ExperienceContext {
  schema: "kardio.experience-context/0.1";
  runId: string;
  manifestVersion: number;
  intent: { job: string; family: string; specialty: string; nosology: string | null; subtype: string | null; drugs: string[] };
  /** Entity ids of the result. */
  entities: string[];
  graphId: string;
  /** Visible modules, in order (id + family). */
  visibleModules: Array<{ id: string; family: ModuleFamily }>;
  /** Documents in the order the physician sees them («второй источник»). */
  visibleDocuments: string[];
  selectedModuleId: string | null;
  selectedEntityId: string | null;
  /** The view currently applied. */
  view: ManifestView;
  /** Previous patches of this result (versions and kinds). */
  previousPatches: Array<{ manifestVersion: number; kind: string }>;
  /** Sources that answered (validated source set). */
  validatedSources: string[];
}

export const EMPTY_VIEW: ManifestView = { jurisdiction: null, since: null, focus: [], expandedDocumentId: null, comparison: null };

const CONTENT: ReadonlySet<ModuleFamily> = new Set(["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence"]);

export function visibleDocuments(manifest: ExperienceManifest): string[] {
  const order: string[] = [];
  for (const entry of manifest.modules.filter(item => CONTENT.has(item.family) && item.family !== "key_takeaway")) for (const id of entry.documentIds) if (!order.includes(id)) order.push(id);
  for (const entry of manifest.modules.filter(item => item.family === "key_takeaway")) for (const id of entry.documentIds) if (!order.includes(id)) order.push(id);
  return order;
}

export function buildExperienceContext(run: { id: string; progress?: { manifestVersion: number } | null; patches?: Array<{ manifestVersion: number; reason?: { intentDelta: { kind: string } | null } }> }, experience: { manifest: ExperienceManifest; graph: EvidenceGraph }): ExperienceContext {
  const { manifest, graph } = experience;
  return {
    schema: "kardio.experience-context/0.1",
    runId: run.id,
    manifestVersion: run.progress?.manifestVersion ?? 0,
    intent: { job: manifest.intent.job, family: manifest.intent.family, specialty: manifest.intent.specialty, nosology: manifest.intent.nosology, subtype: manifest.intent.subtype, drugs: [...graph.context.drugs] },
    entities: [...new Set([...(manifest.intent.nosology ? [`nosology:${manifest.intent.nosology}`] : []), ...(manifest.intent.subtype ? [`subtype:${manifest.intent.subtype}`] : []), ...graph.context.drugs.map(drug => `drug:${drug}`)])],
    graphId: graph.id,
    visibleModules: manifest.modules.map(entry => ({ id: entry.id, family: entry.family })),
    visibleDocuments: visibleDocuments(manifest),
    selectedModuleId: null,
    selectedEntityId: null,
    view: manifest.view ?? EMPTY_VIEW,
    previousPatches: (run.patches ?? []).slice(-10).map(patch => ({ manifestVersion: patch.manifestVersion, kind: patch.reason?.intentDelta?.kind ?? "source_result" })),
    validatedSources: [...new Set(graph.sources.filter(source => source.outcome === "ok").map(source => source.id))],
  };
}

const L = "(?<![\\p{L}])";
const RUSSIAN_ONLY = new RegExp(`${L}(?:(?:только|лишь|оставь\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:российск|отечествен|русскоязычн|рф(?![\\p{L}]))|без\\s+(?:зарубежн|иностранн|международн))`, "u");
const SINCE = new RegExp(`${L}(после|позже|начиная\\s+с|с)\\s+(20\\d{2})(?:\\s*(?:г\\.?|года?))?`, "u");
const SINCE_SCOPE = new RegExp(`${L}(?:только|покажи|оставь|измени|новое|обновлен)`, "u");
const DATA = new RegExp(`${L}(?:данн|исследован|публикац|обзор|метаанализ|статьи)`, "u");
const FOCUS: ReadonlyArray<{ id: string; kinds: ClaimKind[]; pattern: RegExp }> = [
  { id: "dosing", kinds: ["dosing"], pattern: new RegExp(`${L}(?:дозировк|дозирован|доз[ыа]?(?![\\p{L}])|способ\\p{L}* применени)`, "u") },
  { id: "contraindications", kinds: ["contraindication"], pattern: new RegExp(`${L}противопоказани`, "u") },
  { id: "safety", kinds: ["contraindication", "warning"], pattern: new RegExp(`${L}(?:безопасност|предупрежден|особые указани|побочн)`, "u") },
  { id: "indications", kinds: ["indication"], pattern: new RegExp(`${L}показани`, "u") },
];
const ONLY = new RegExp(`${L}(?:только|лишь|сравни\\s+только|оставь|покажи\\s+только)`, "u");
const ORDINALS: ReadonlyArray<[RegExp, number]> = [
  [new RegExp(`${L}перв\\p{L}*`, "u"), 1], [new RegExp(`${L}втор\\p{L}*`, "u"), 2], [new RegExp(`${L}трет\\p{L}*`, "u"), 3],
  [new RegExp(`${L}четв[её]рт\\p{L}*`, "u"), 4], [new RegExp(`${L}пят\\p{L}*`, "u"), 5],
];
const EXPAND = new RegExp(`${L}(?:раскрой|разверни|покажи\\s+подробн|открой\\s+подробн|подробнее\\s+(?:про|о))\\p{L}*`, "u");
const SOURCE_WORD = new RegExp(`${L}(?:источник|документ|рекомендац|публикац|стать)`, "u");
const VERSION_DELTA = new RegExp(`${L}(?:что\\s+(?:\\p{L}+\\s+)?изменил\\p{L}*|чем\\s+отлича\\p{L}*|сравни\\p{L}*)\\s+(?:\\p{L}+\\s+){0,3}(?:относительно|по\\s+сравнению\\s+с|с)\\s+(?:прошл|предыдущ|прежн|стар)`, "u");
const VERSION_DELTA_SHORT = new RegExp(`${L}(?:относительно|по\\s+сравнению\\s+с)\\s+(?:прошл|предыдущ|прежн)\\p{L}*\\s+верси`, "u");
const RESET = new RegExp(`${L}(?:покажи\\s+вс[её]|верни\\s+вс[её]|сброс\\p{L}*|без\\s+фильтр|все\\s+источники)`, "u");

/**
 * Read a follow-up as a refinement of the open result, or return null (a new
 * question). A follow-up that names a different drug or disease is never a
 * refinement — it is a new question with the session as context.
 */
export function classifyDelta(text: string, context: ExperienceContext, named: { drugs: string[]; nosology: string | null }): IntentDelta | null {
  const value = normalizeQuery(text);
  if (value.length > 160) return null;
  const foreignDrug = named.drugs.some(drug => !context.intent.drugs.includes(drug));
  const foreignTopic = Boolean(named.nosology && context.intent.nosology && named.nosology !== context.intent.nosology) || Boolean(named.nosology && !context.intent.nosology);
  if (foreignDrug || foreignTopic) return null;
  if (RESET.test(value) && (context.view.jurisdiction || context.view.since || context.view.focus.length || context.view.expandedDocumentId || context.view.comparison)) return { kind: "reset", params: {} };
  if (RUSSIAN_ONLY.test(value)) return { kind: "filter_jurisdiction", params: { jurisdiction: "RU" } };
  if (VERSION_DELTA.test(value) || VERSION_DELTA_SHORT.test(value)) return { kind: "version_delta", params: {} };
  const since = value.match(SINCE);
  if (since && (SINCE_SCOPE.test(value) || DATA.test(value))) {
    const year = Number(since[2]);
    const after = since[1] === "после" || since[1] === "позже";
    const from = after ? year + 1 : year;
    return DATA.test(value) ? { kind: "fresh_since", params: { year: from } } : { kind: "filter_since", params: { year: from } };
  }
  if (EXPAND.test(value) && SOURCE_WORD.test(value)) {
    const ordinal = ORDINALS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
    if (ordinal) return { kind: "expand", params: { ordinal } };
  }
  if (ONLY.test(value)) {
    const focus = FOCUS.find(item => item.pattern.test(value));
    if (focus) return { kind: "focus", params: { focus: focus.id } };
  }
  return null;
}

export function focusKinds(focus: string): ClaimKind[] {
  return FOCUS.find(item => item.id === focus)?.kinds ?? [];
}

function year(document: GraphDocument): number | null {
  const match = (document.version.date ?? document.publishedAt ?? "").match(/(19|20)\d{2}/u);
  return match ? Number(match[0]) : null;
}

/** The graph as the view shows it: documents (and their claims, conflicts, sources' counts) outside the view are withheld, never rewritten. */
export function applyView(graph: EvidenceGraph, view: ManifestView | null | undefined): EvidenceGraph {
  if (!view || (!view.jurisdiction && !view.since && !view.focus.length)) return graph;
  const kinds = new Set(view.focus.flatMap(focusKinds));
  const documents = graph.documents.filter(document => (!view.jurisdiction || document.jurisdiction === view.jurisdiction) && (!view.since || (year(document) ?? 0) >= view.since));
  const kept = new Set(documents.map(document => document.id));
  const instructions = new Set(documents.filter(document => document.kind === "drug_instruction" || document.kind === "drug_label").map(document => document.id));
  // A focus narrows the instruction to the asked sections; other documents stay as they were.
  const claims = graph.claims.filter(claim => kept.has(claim.documentId) && (!kinds.size || !instructions.has(claim.documentId) || kinds.has(claim.kind)));
  const claimIds = new Set(claims.map(claim => claim.id));
  const allClaims = new Set(graph.claims.map(claim => claim.id));
  const withheld = (id: string) => (allClaims.has(id) && !claimIds.has(id)) || (graph.documents.some(document => document.id === id) && !kept.has(id));
  return {
    ...graph,
    documents,
    claims,
    chunks: graph.chunks.filter(chunk => kept.has(chunk.documentId)),
    versions: graph.versions.filter(version => kept.has(version.documentId)),
    relations: graph.relations.filter(relation => !withheld(relation.from) && !withheld(relation.to)),
    conflicts: graph.conflicts.filter(conflict => conflict.claimIds.every(id => claimIds.has(id))),
    freshness: graph.freshness.filter(item => kept.has(item.documentId)),
  };
}

export interface DeltaResolution {
  view: ManifestView;
  /** Requirements the delta touches. */
  requirements: EvidenceRequirement[];
  /** Graph nodes the new view depends on. */
  documentIds: string[];
  claimIds: string[];
  /** What the graph lacks and a source must provide (empty = answered from the graph). */
  retrieval: Array<{ requirement: EvidenceRequirement; reason: string; since?: number; focus?: string }>;
  /** Physician-language line describing the applied refinement (fixed copy). */
  label: string;
  /** Why the delta cannot be applied to this result (fixed copy), if so. */
  refused: string | null;
}

const VIEW_LABEL: Record<IntentDeltaKind, string> = {
  filter_jurisdiction: "Показаны только российские источники",
  filter_since: "Показаны только документы с {year} года",
  fresh_since: "Показаны данные с {year} года",
  focus: "Показаны только разделы инструкции: {focus}",
  expand: "Раскрыт источник № {ordinal}",
  version_delta: "Сравнение с предыдущей версией рекомендаций",
  reset: "Показан полный результат",
};

const FOCUS_LABEL: Record<string, string> = { dosing: "способ применения и дозы", contraindications: "противопоказания", safety: "противопоказания и особые указания", indications: "показания" };

function label(delta: IntentDelta): string {
  return VIEW_LABEL[delta.kind].replace("{year}", String(delta.params.year ?? "")).replace("{ordinal}", String(delta.params.ordinal ?? "")).replace("{focus}", FOCUS_LABEL[String(delta.params.focus)] ?? "");
}

/** IntentDelta → affected requirements → graph nodes → the next view, and whether a source must be asked. */
export function resolveDelta(delta: IntentDelta, context: ExperienceContext, graph: EvidenceGraph): DeltaResolution {
  const base: ManifestView = { ...context.view };
  const result = (view: ManifestView, args: Partial<DeltaResolution> = {}): DeltaResolution => {
    const visible = applyView(graph, view);
    return { view, requirements: [], documentIds: visible.documents.map(document => document.id), claimIds: visible.claims.map(claim => claim.id), retrieval: [], label: label(delta), refused: null, ...args };
  };
  switch (delta.kind) {
    case "reset":
      return result(EMPTY_VIEW);
    case "filter_jurisdiction": {
      const view = { ...base, jurisdiction: "RU" as const };
      const visible = applyView(graph, view);
      const withheld = graph.documents.filter(document => document.jurisdiction !== "RU");
      if (!visible.documents.length) return result(base, { refused: "В этом результате нет российских источников — показан полный результат." });
      return result(view, { requirements: [...new Set(withheld.map(document => graph.sources.find(source => source.id === document.sourceId)?.requirement).filter((item): item is EvidenceRequirement => Boolean(item)))] });
    }
    case "filter_since": {
      const view = { ...base, since: Number(delta.params.year) };
      if (!applyView(graph, view).documents.length) return result(base, { refused: `Документов с ${delta.params.year} года в этом результате нет — показан полный результат.` });
      return result(view);
    }
    case "fresh_since": {
      const since = Number(delta.params.year);
      const view = { ...base, since };
      const research = applyView(graph, view).documents.filter(document => document.kind === "review" || document.kind === "guideline_publication");
      // The graph has no research from that year on: one targeted literature search, not a rerun.
      return result(view, { requirements: ["current_research"], retrieval: research.length ? [] : [{ requirement: "current_research", reason: "в результате нет публикаций за этот период", since }] });
    }
    case "focus": {
      const focus = String(delta.params.focus);
      const kinds = new Set(focusKinds(focus));
      const view = { ...base, focus: [focus] };
      const instructions = graph.documents.filter(document => document.kind === "drug_instruction" || document.kind === "drug_label");
      const has = graph.claims.some(claim => kinds.has(claim.kind) && instructions.some(document => document.id === claim.documentId));
      if (!context.intent.drugs.length) return result(base, { refused: "В этом результате нет препарата — уточните его в запросе." });
      return result(view, { requirements: ["russian_drug_reference"], retrieval: has ? [] : [{ requirement: "russian_drug_reference", reason: "в результате нет этого раздела инструкции", focus }] });
    }
    case "expand": {
      const ordinal = Number(delta.params.ordinal);
      const documentId = context.visibleDocuments[ordinal - 1] ?? null;
      if (!documentId) return result(base, { refused: `В результате нет источника № ${ordinal}.` });
      return result({ ...base, expandedDocumentId: documentId }, { documentIds: [documentId], claimIds: graph.claims.filter(claim => claim.documentId === documentId).map(claim => claim.id) });
    }
    case "version_delta": {
      const previous = graph.documents.some(document => typeof document.attributes.previousVersion === "string" && document.attributes.previousVersion);
      const view = { ...base, comparison: "previous_version" as const };
      if (previous) return result(view, { requirements: ["specialty_society_guideline"] });
      // No stated previous version in the result: ask the society-guideline source when it was not asked yet.
      const asked = graph.sources.some(source => source.requirement === "specialty_society_guideline" && source.outcome !== "not_invoked");
      return result(view, { requirements: ["specialty_society_guideline"], retrieval: asked || !context.intent.nosology ? [] : [{ requirement: "specialty_society_guideline", reason: "в результате нет сведений о предыдущей версии" }] });
    }
  }
}

type Scalar = string | number | boolean | null | string[];

/** The view as bounded module props and takeaway priority (fixed copy and graph ids only). */
export function viewDirectives(graph: EvidenceGraph, manifest: ExperienceManifest | null, view: ManifestView): { moduleProps: Partial<Record<ModuleFamily, Record<string, Scalar>>>; priorityClaims: string[] } {
  const moduleProps: Partial<Record<ModuleFamily, Record<string, Scalar>>> = {};
  const priorityClaims: string[] = [];
  if (view.comparison === "previous_version") {
    const previous = graph.documents.filter(document => typeof document.attributes.previousVersion === "string" && document.attributes.previousVersion).sort((a, b) => (b.version.date ?? b.publishedAt ?? "").localeCompare(a.version.date ?? a.publishedAt ?? ""))[0];
    if (previous) {
      const changed = graph.claims.filter(claim => claim.documentId === previous.id && claim.kind === "society_assertion" && claim.verification !== "UNSUPPORTED").map(claim => claim.id);
      moduleProps.recommendation_delta = { comparison: "previous_version", previousVersion: String(previous.attributes.previousVersion), changedDocumentId: previous.id, changedClaimIds: changed };
      priorityClaims.push(...changed);
    } else moduleProps.recommendation_delta = { comparison: "current_state" };
  }
  if (view.focus.length) {
    moduleProps.drug_reference = { focus: view.focus[0] };
    const kinds = new Set(view.focus.flatMap(focusKinds));
    priorityClaims.push(...graph.claims.filter(claim => kinds.has(claim.kind)).map(claim => claim.id));
  }
  if (view.expandedDocumentId) {
    const holder = manifest?.modules.find(entry => entry.family !== "key_takeaway" && entry.documentIds.includes(view.expandedDocumentId!));
    if (holder) moduleProps[holder.family] = { ...(moduleProps[holder.family] ?? {}), expandedDocumentId: view.expandedDocumentId };
  }
  return { moduleProps, priorityClaims };
}

/** Fixed physician-language description of an applied view (shown above the result). */
export function viewLabel(view: ManifestView | null | undefined): string | null {
  if (!view) return null;
  const parts = [
    view.jurisdiction === "RU" ? "только российские источники" : null,
    view.since ? `документы с ${view.since} года` : null,
    view.focus.length ? `разделы инструкции: ${view.focus.map(item => FOCUS_LABEL[item] ?? item).join(", ")}` : null,
    view.comparison === "previous_version" ? "сравнение с предыдущей версией" : null,
    view.expandedDocumentId ? "источник раскрыт полностью" : null,
  ].filter((item): item is string => Boolean(item));
  return parts.length ? `Показано: ${parts.join(" · ")}` : null;
}

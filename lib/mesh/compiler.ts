import { densityForMode, type AnswerMode } from "@/lib/portal/answer-mode";
import type { PortalJob } from "@/lib/portal/jobs";
import type { ClaimKind, EvidenceGraph, GraphDocument, NormalizedClaim } from "./evidence";
import type { JobType } from "./jobs";
import { experienceManifestSchema, MANIFEST_SCHEMA, MODULE_POLICY, STABLE_SHELL_VERSION, type ExperienceManifest, type ManifestAction, type ManifestExecution, type ManifestModule, type ManifestView, type ModuleFamily, type RepresentationMode } from "./manifest";
import { validateManifest, type PolicyContext, type PolicyReport } from "./policies";

/**
 * Experience Compiler:
 *
 *   EvidenceGraph + UserContext + Job + ExperiencePolicy → ExperienceManifest
 *
 * Deterministic and model-free. It selects approved entry families in policy
 * order, points every entry at graph ids, sets density and next actions, and
 * validates the result against the manifest schema and the policy gates. A
 * manifest that fails is replaced by a simple safe representation — never
 * shipped as is.
 */

export const COMPILER_VERSION = "experience-compiler/0.1";

export interface UserContext {
  /** Real signals available for this request (e.g. «specialty», «saved_topic:hf»). Never inferred traits. */
  signals: string[];
  /** Physician's own topics, when they set them. */
  topics: string[];
}

export interface CompileInput {
  graph: EvidenceGraph;
  user: UserContext;
  /** Preferred entry order from the domain graph scenario. */
  modules: readonly ModuleFamily[];
  /** Persisted result key of each document (for save/open tracking), when results exist. */
  resultKeys?: Readonly<Record<string, string>>;
  policy: PolicyContext;
  scenario: string | null;
  /** A Skill's key-takeaway priority for this family (kind, cap); the compiler default otherwise. */
  takeaway?: ReadonlyArray<readonly [ClaimKind, number]> | null;
  /** Claims a Flow puts first in the key takeaway (e.g. the instruction's section on children). */
  priorityClaims?: readonly string[];
  /** Flow directives: scalar props merged into approved modules. */
  moduleProps?: Partial<Record<ModuleFamily, Record<string, string | number | boolean | null | string[]>>>;
  /** How the result is executed (recorded in the manifest; ids are never rendered). */
  execution?: ManifestExecution | null;
  /** Depth the physician asked for: «short» compiles compact, the claim count decides otherwise. */
  answerMode?: AnswerMode | null;
  /** A refinement view already applied to the graph (recorded in the manifest). */
  view?: ManifestView | null;
}

export interface CompileOutput {
  manifest: ExperienceManifest;
  report: PolicyReport;
  fallback: boolean;
  /** Findings of the rejected candidate when the fallback was used. */
  rejected: PolicyReport | null;
}

function hash(parts: readonly string[]): string {
  let value = 2166136261;
  for (const char of parts.join("|")) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619) >>> 0; }
  return value.toString(36);
}

const REPRESENTATION: Record<JobType, RepresentationMode> = {
  reference_answer: "professional_answer",
  disease_reference: "professional_answer",
  professional_article_search: "source_list",
  drug_reference: "drug_card",
  inn_lookup: "drug_card",
  guideline_check: "guideline_delta",
  guideline_discovery: "guideline_delta",
  evidence_review: "evidence_comparison",
  event_search: "event_list",
  learning_next_step: "learning_step",
  updates_digest: "source_list",
  materials_search: "source_list",
};

const DATE = (document: GraphDocument | undefined) => document?.version.date ?? document?.publishedAt ?? "";

/** Claim priority for the key takeaway per job family, with a per-kind cap. */
const TAKEAWAY_ORDER: Record<string, ReadonlyArray<[ClaimKind, number]>> = {
  guideline: [["currentness", 1], ["guideline_statement", 1], ["guideline_metadata", 1], ["drug_not_mentioned", 1], ["indication", 1], ["society_assertion", 1], ["review_conclusion", 1]],
  drug: [["indication", 3], ["contraindication", 1], ["regulatory_signal", 2], ["product_listing", 4], ["warning", 1], ["dosing", 1]],
  answer: [["review_conclusion", 3], ["indication", 1], ["guideline_statement", 1], ["society_assertion", 1], ["currentness", 1]],
};
const TAKEAWAY_MAX = 6;

/** Sentences about the document or future work («the panel formulated», «further research is needed») are not an answer. */
const NOT_A_FINDING = /^(?:the (?:panel|committee|working group)|this (?:review|guideline|document|update) (?:summarizes|provides|describes|presents))|^(?:however, )?(?:further|future) (?:research|studies|efforts|trials)/iu;
function informative(claim: NormalizedClaim): boolean {
  return claim.kind !== "review_conclusion" || !NOT_A_FINDING.test(claim.statement.trim());
}

/** Publications a widened search found with only part of the question's conditions: never the answer itself. */
export function widenedDocuments(graph: EvidenceGraph): GraphDocument[] {
  return graph.documents.filter(document => document.attributes.questionMatch === "partial");
}

function takeawayClaims(graph: EvidenceGraph, input: Pick<CompileInput, "takeaway" | "priorityClaims" | "moduleProps"> = {}): string[] {
  const docs = new Map(graph.documents.map(document => [document.id, document]));
  const widened = new Set(widenedDocuments(graph).map(document => document.id));
  const askedSections = Array.isArray(input.moduleProps?.drug_reference?.asked) ? input.moduleProps.drug_reference.asked as string[] : [];
  const family = graph.family === "guidelines" ? "guideline" : graph.family === "drug" ? "drug" : "answer";
  const nosology = graph.context.nosology ? `nosology:${graph.context.nosology}` : null;
  const subtype = graph.context.subtype;
  const relevant = (claim: NormalizedClaim) => claim.verification !== "UNSUPPORTED"
    && !widened.has(claim.documentId)
    // A review's conclusion answers a question about a disease only when it names that disease (title or conclusion).
    && (claim.kind !== "review_conclusion" || !nosology || claim.entityIds.includes(nosology))
    // A question that names instruction sections is answered from them: no indications or document metadata instead.
    && (!askedSections.length || ((claim.kind !== "indication" || askedSections.includes("indications")) && claim.kind !== "guideline_metadata" && claim.kind !== "currentness"))
    && informative(claim)
    && (claim.kind !== "indication" || !nosology || family === "drug" || claim.entityIds.includes(nosology))
    && (claim.kind !== "product_listing" || graph.job === "inn_lookup");
  const onSubtype = (claim: NormalizedClaim) => Number(Boolean(subtype && (claim.covers.includes(subtype) || claim.entityIds.includes(`subtype:${subtype}`))));
  const terms = graph.context.terms ?? [];
  const onTopic = (claim: NormalizedClaim) => { const text = `${claim.statement} ${claim.quote ?? ""}`.toLowerCase(); return terms.filter(term => text.includes(term)).length; };
  // A conclusion that speaks about what was asked («duration») comes before newer ones that do not.
  // A word group every conclusion mentions («antibiotic») does not tell them apart; a rare one («duration») does.
  const asked = graph.context.asked ?? [];
  const claimText = (claim: NormalizedClaim) => `${claim.statement} ${claim.quote ?? ""}`.toLowerCase();
  const weights = asked.map(group => 1 / Math.max(1, graph.claims.filter(claim => group.some(word => claimText(claim).includes(word))).length));
  const onAsked = (claim: NormalizedClaim) => { const text = claimText(claim); return asked.reduce((sum, group, index) => sum + (group.some(word => text.includes(word)) ? weights[index] : 0), 0); };
  const picked: string[] = [];
  for (const claimId of input.priorityClaims ?? []) {
    const claim = graph.claims.find(item => item.id === claimId);
    if (claim && relevant(claim) && !picked.includes(claimId) && picked.length < TAKEAWAY_MAX) picked.push(claimId);
  }
  for (const [kind, cap] of input.takeaway ?? TAKEAWAY_ORDER[family]) {
    const candidates = graph.claims.filter(claim => claim.kind === kind && relevant(claim))
      // On the asked subtype first, Russian sources before international, newer first, then source relevance.
      .sort((a, b) => onAsked(b) - onAsked(a) || onTopic(b) - onTopic(a) || onSubtype(b) - onSubtype(a)
        || Number(docs.get(a.documentId)?.jurisdiction !== "RU") - Number(docs.get(b.documentId)?.jurisdiction !== "RU")
        || DATE(docs.get(b.documentId)).localeCompare(DATE(docs.get(a.documentId)))
        || Number(docs.get(a.documentId)?.attributes.relevance ?? 0) - Number(docs.get(b.documentId)?.attributes.relevance ?? 0));
    // Document metadata is already in each item's source line; it is shown only for a document with nothing else picked.
    const pool = kind === "guideline_metadata" ? candidates.filter(claim => !picked.some(id => graph.claims.find(item => item.id === id)?.documentId === claim.documentId)) : candidates;
    for (const claim of pool.filter(item => !picked.includes(item.id)).slice(0, cap)) if (picked.length < TAKEAWAY_MAX) picked.push(claim.id);
  }
  return picked;
}

/** Claims that speak about the question's drug, class or subtype first (deterministic word overlap). */
function relevance(graph: EvidenceGraph, claim: NormalizedClaim): number {
  const text = `${claim.statement} ${claim.quote ?? ""}`.toLowerCase();
  const subtype = graph.context.subtype;
  return (graph.context.terms ?? []).filter(term => text.includes(term)).length * 2 + Number(Boolean(subtype && (claim.covers.includes(subtype) || claim.entityIds.includes(`subtype:${subtype}`))));
}

function moduleFor(family: ModuleFamily, fullGraph: EvidenceGraph, input: CompileInput): ManifestModule | null {
  // Claims a source does not support (e.g. physician-rejected sources) are never shown as evidence.
  const graph: EvidenceGraph = { ...fullGraph, claims: fullGraph.claims.filter(claim => claim.verification !== "UNSUPPORTED") };
  const id = `${family}-${hash([graph.id, family])}`;
  const base = { id, family, title: MODULE_POLICY[family].title, emphasis: "secondary" as const, collapsed: false, claimIds: [] as string[], documentIds: [] as string[], resultKeys: [] as string[], props: {} as ManifestModule["props"] };
  const keysFor = (documentIds: readonly string[]) => documentIds.map(documentId => input.resultKeys?.[documentId]).filter((key): key is string => Boolean(key));
  const byDate = (a: GraphDocument, b: GraphDocument) => DATE(b).localeCompare(DATE(a));
  switch (family) {
    case "key_takeaway": {
      const claimIds = takeawayClaims(graph, input);
      const widened = widenedDocuments(graph);
      const unmatched = [...new Set(widened.flatMap(document => String(document.attributes.unmatchedConditions ?? "").split(", ").filter(Boolean)))].join(", ");
      // Nothing answers the question as asked: the first thing the physician reads says so, not a neighbour's conclusion.
      const reviews = graph.documents.filter(document => document.kind === "review" || document.kind === "guideline_publication");
      if (!claimIds.length) return widened.length || (graph.family === "answer" && reviews.length) ? { ...base, emphasis: "primary", documentIds: (widened.length ? widened : reviews).map(document => document.id), props: { gaps: graph.gaps, noDirectAnswer: true, unmatched: unmatched || null } } : null;
      return { ...base, emphasis: "primary", claimIds, documentIds: [...new Set(claimIds.map(claimId => graph.claims.find(claim => claim.id === claimId)!.documentId))], props: { gaps: graph.gaps, widened: widened.length, unmatched: unmatched || null } };
    }
    case "recommendation_delta": {
      const docs = graph.documents.filter(document => document.kind === "guideline" || document.kind === "society_guideline_summary" || document.kind === "guideline_publication").sort(byDate);
      if (!docs.length) return null;
      const ids = new Set(docs.map(document => document.id));
      // Russian guideline: every statement about it; society summaries: the three most on-topic assertions (the rest is one click away).
      const society = graph.claims.filter(claim => ids.has(claim.documentId) && claim.kind === "society_assertion");
      const topSociety = new Set(docs.filter(document => document.kind === "society_guideline_summary").flatMap(document => society.filter(claim => claim.documentId === document.id).map((claim, order) => ({ claim, order })).sort((a, b) => relevance(graph, b.claim) - relevance(graph, a.claim) || a.order - b.order).slice(0, 3).map(item => item.claim.id)));
      const claimIds = graph.claims.filter(claim => ids.has(claim.documentId) && (claim.kind === "guideline_metadata" || claim.kind === "currentness" || claim.kind === "guideline_statement" || claim.kind === "drug_not_mentioned" || (claim.kind === "society_assertion" && topSociety.has(claim.id)))).map(claim => claim.id);
      const label = [graph.context.nosology ? graph.entities.find(entity => entity.id === `nosology:${graph.context.nosology}`)?.label : null, graph.context.subtype ? graph.entities.find(entity => entity.id === `subtype:${graph.context.subtype}`)?.label : null].filter(Boolean).join(" ");
      return { ...base, title: label ? `${base.title}: ${label}`.slice(0, 120) : base.title, documentIds: docs.map(document => document.id), claimIds, resultKeys: keysFor(docs.map(document => document.id)), props: { order: "newest_first", versions: docs.length } };
    }
    case "conflict": {
      if (!graph.conflicts.length) return null;
      return { ...base, emphasis: "primary", claimIds: [...new Set(graph.conflicts.flatMap(conflict => conflict.claimIds))], documentIds: [...new Set(graph.conflicts.flatMap(conflict => conflict.claimIds.map(claimId => graph.claims.find(claim => claim.id === claimId)!.documentId)))], props: { conflictIds: graph.conflicts.map(conflict => conflict.id) } };
    }
    case "drug_reference": {
      const docs = graph.documents.filter(document => document.kind === "drug_instruction" || document.kind === "drug_label" || (graph.job === "inn_lookup" && document.kind === "inn_listing"));
      if (!docs.length) return null;
      const ids = new Set(docs.map(document => document.id));
      const nosology = graph.context.nosology ? `nosology:${graph.context.nosology}` : null;
      // Outside the drug job, indications are shown only for the disease asked about; safety sections stay.
      const claimIds = graph.claims.filter(claim => ids.has(claim.documentId) && (graph.family === "drug" || claim.kind !== "indication" || !nosology || claim.entityIds.includes(nosology))).map(claim => claim.id);
      return { ...base, emphasis: graph.family === "drug" ? "primary" : "secondary", documentIds: docs.map(document => document.id), claimIds, resultKeys: keysFor(docs.map(document => document.id)), props: { boundary: docs.some(document => document.jurisdiction !== "RU") || docs.some(document => document.authority !== "official"), jurisdictions: [...new Set(docs.map(document => document.jurisdiction))] } };
    }
    case "evidence": {
      const docs = graph.documents.filter(document => document.kind === "review" || (document.kind === "guideline_publication" && graph.family !== "guidelines")).sort((a, b) => Number(a.attributes.questionMatch === "partial") - Number(b.attributes.questionMatch === "partial") || Number(a.attributes.relevance ?? 99) - Number(b.attributes.relevance ?? 99));
      if (!docs.length) return null;
      const ids = new Set(docs.map(document => document.id));
      return { ...base, documentIds: docs.map(document => document.id), claimIds: graph.claims.filter(claim => ids.has(claim.documentId) && claim.kind === "review_conclusion").map(claim => claim.id), resultKeys: keysFor(docs.map(document => document.id)), props: { language: "en" } };
    }
    case "sources": {
      const used = graph.sources.filter(source => source.outcome !== "not_invoked");
      return used.length ? { ...base, collapsed: true, props: { sourceIds: [...new Set(used.map(source => source.id))] } } : null;
    }
    case "handoff": {
      const handoffs = graph.sources.filter(source => source.outcome === "handoff" && source.handoffUrl);
      return handoffs.length ? { ...base, props: { sourceIds: [...new Set(handoffs.map(source => source.id))] } } : null;
    }
    case "next_actions":
      // Nothing was found: the useful next step is to rephrase, not to run another job on the same words.
      return graph.documents.length ? { ...base, props: {} } : null;
    case "notices":
      return graph.gaps.length ? { ...base, props: { gaps: graph.gaps } } : null;
    default:
      return null;
  }
}

const FOLLOW_UPS: Partial<Record<PortalJob, Array<{ job: PortalJob; label: string }>>> = {
  guidelines: [{ job: "research", label: "Разбор по исследованиям" }, { job: "drug", label: "Справка по препарату" }, { job: "learning", label: "Что изучить по теме" }],
  drug: [{ job: "guidelines", label: "Клинические рекомендации по теме" }, { job: "research", label: "Разбор по исследованиям" }],
  answer: [{ job: "research", label: "Разбор по исследованиям" }, { job: "guidelines", label: "Клинические рекомендации по теме" }, { job: "learning", label: "Что изучить по теме" }],
};

function actionsFor(graph: EvidenceGraph, modules: readonly ManifestModule[]): ManifestAction[] {
  const actions: ManifestAction[] = [];
  const shown = new Set(modules.flatMap(entry => entry.documentIds));
  for (const document of graph.documents.filter(item => shown.has(item.id)).slice(0, 4)) {
    actions.push({ id: `open-${hash([document.id])}`, kind: "open_source", label: "Открыть источник", documentId: document.id, href: document.url, job: null });
  }
  const versions = graph.documents.filter(document => (document.kind === "guideline" || document.kind === "society_guideline_summary") && DATE(document));
  if (versions.length >= 2) actions.push({ id: `compare-${hash([graph.id])}`, kind: "compare_versions", label: "Сравнить версии", documentId: null, href: null, job: null });
  for (const source of graph.sources.filter(item => item.outcome === "handoff" && item.handoffUrl)) {
    actions.push({ id: `verify-${source.id}`, kind: "verify_official", label: source.id === "grls" ? "Проверить в ГРЛС" : "Открыть рубрикатор", documentId: null, href: source.handoffUrl, job: null });
  }
  for (const follow of (FOLLOW_UPS[graph.family] ?? []).slice(0, 3)) {
    actions.push({ id: `follow-${follow.job}`, kind: follow.job === "research" ? "investigate_deeper" : "follow_up", label: follow.label, documentId: null, href: null, job: follow.job });
  }
  return actions.slice(0, 12);
}

function assemble(graph: EvidenceGraph, input: CompileInput, modules: ManifestModule[], args: { fallback: boolean; warnings: string[]; decisions: string[]; report?: PolicyReport }): ExperienceManifest {
  const claimCount = new Set(modules.flatMap(entry => entry.claimIds)).size;
  const density = densityForMode(input.answerMode) ?? (graph.family === "research" || claimCount > 10 ? "standard" : claimCount <= 6 ? "compact" : "standard");
  return {
    schema: MANIFEST_SCHEMA,
    id: `manifest-${hash([graph.id, ...modules.map(entry => entry.id), String(args.fallback)])}`,
    graphId: graph.id,
    createdAt: graph.createdAt,
    intent: { job: graph.job, family: graph.family, specialty: graph.specialty, nosology: graph.context.nosology, subtype: graph.context.subtype, scenario: input.scenario },
    representation: { density, mode: args.fallback ? "safe_answer" : REPRESENTATION[graph.job] },
    modules,
    actions: actionsFor(graph, modules),
    personalization: { applied: false, source: "default", signals: input.user.signals.filter(signal => signal === "specialty" || signal.startsWith("saved_topic:")) },
    stableShell: STABLE_SHELL_VERSION,
    provenance: { sourceIds: [...new Set(graph.sources.filter(source => source.outcome !== "not_invoked").map(source => source.id))], documentCount: graph.documents.length, claimCount: graph.claims.length },
    compiler: { version: COMPILER_VERSION, fallback: args.fallback, warnings: args.warnings, decisions: args.decisions, policy: { passed: args.report?.passed ?? true, blocking: args.report?.blocking ?? 0, findings: args.report?.findings.length ?? 0 } },
    ...(input.execution ? { execution: input.execution } : {}),
    ...(input.view ? { view: input.view } : {}),
  };
}

/** The simplest honest representation: what was found, where, and what is missing. */
/** The graph without documents whose claims a blocking policy flagged (nothing is rewritten, only withheld). */
export function withholdClaims(graph: EvidenceGraph, excludedClaims: ReadonlySet<string>): EvidenceGraph {
  if (!excludedClaims.size) return graph;
  const documents = new Set(graph.claims.filter(claim => excludedClaims.has(claim.id)).map(claim => claim.documentId));
  const kept = graph.claims.filter(claim => !documents.has(claim.documentId));
  const keptIds = new Set(kept.map(claim => claim.id));
  return {
    ...graph,
    claims: kept,
    documents: graph.documents.filter(document => !documents.has(document.id)),
    conflicts: graph.conflicts.filter(conflict => conflict.claimIds.every(id => keptIds.has(id))),
    gaps: [...graph.gaps, "часть материалов не показана: условия использования источника не позволяют показать эти выдержки"],
  };
}

export function safeManifest(graph: EvidenceGraph, input: CompileInput, reason: string, excludedClaims: ReadonlySet<string> = new Set()): ExperienceManifest {
  graph = withholdClaims(graph, excludedClaims);
  const modules = (["conflict", "notices", "sources", "handoff", "next_actions"] as const).map(family => moduleFor(family, graph, input)).filter((entry): entry is ManifestModule => Boolean(entry));
  // Quotes as they are, with every currentness note — nothing composed.
  const claimIds = graph.claims.filter(claim => (claim.method === "verbatim" && claim.verification !== "UNSUPPORTED") || claim.kind === "currentness").slice(0, 8).map(claim => claim.id);
  const documentIds = [...new Set([...claimIds.map(id => graph.claims.find(claim => claim.id === id)!.documentId), ...graph.documents.map(document => document.id)])].slice(0, 8);
  const withContent = graph.documents.length ? [{ id: `sources-list-${hash([graph.id])}`, family: "evidence" as const, title: MODULE_POLICY.evidence.title, emphasis: "primary" as const, collapsed: false, claimIds, documentIds, resultKeys: [], props: { language: "mixed" } }, ...modules] : modules;
  const safe = withContent.length ? withContent : [{ id: `next-${hash([graph.id])}`, family: "next_actions" as const, title: MODULE_POLICY.next_actions.title, emphasis: "secondary" as const, collapsed: false, claimIds: [], documentIds: [], resultKeys: [], props: {} }];
  return assemble(graph, input, safe, { fallback: true, warnings: [reason], decisions: ["fallback:safe_answer"] });
}

export function compileExperience(input: CompileInput): CompileOutput {
  const { graph } = input;
  const decisions: string[] = [];
  const warnings: string[] = [];
  // Policy order: takeaway first, then the scenario's order, sources/hand-offs late, next actions last.
  const preferred: ModuleFamily[] = ["key_takeaway", ...input.modules.filter(family => family !== "key_takeaway" && family !== "next_actions" && family !== "sources" && family !== "handoff")];
  if (graph.conflicts.length && !preferred.includes("conflict")) preferred.splice(1, 0, "conflict");
  const ordered: ModuleFamily[] = [...preferred, "notices", "sources", "handoff", "next_actions"];
  const modules: ManifestModule[] = [];
  for (const family of [...new Set(ordered)]) {
    if (!MODULE_POLICY[family].implemented) { decisions.push(`skip:${family}:not_implemented`); continue; }
    const found = moduleFor(family, graph, input);
    if (!found) { decisions.push(`skip:${family}:no_content`); continue; }
    const extra = input.moduleProps?.[family];
    const entry = extra ? { ...found, props: { ...found.props, ...extra } } : found;
    // Gaps are part of the takeaway when there is one.
    if (family === "notices" && modules.some(item => item.family === "key_takeaway")) { decisions.push("merge:notices→key_takeaway"); continue; }
    modules.push(entry);
    decisions.push(`use:${family}`);
  }
  if (!modules.some(entry => MODULE_POLICY[entry.family].requiresEvidence)) warnings.push("no evidence-backed entry");

  const candidate = assemble(graph, input, modules, { fallback: false, warnings, decisions });
  const parsed = experienceManifestSchema.safeParse(candidate);
  if (!parsed.success) {
    const manifest = safeManifest(graph, input, `schema:${parsed.error.issues[0]?.path.join(".") ?? "invalid"}`);
    return { manifest, report: validateManifest(manifest, graph, input.policy), fallback: true, rejected: null };
  }
  const report = validateManifest(parsed.data, graph, input.policy);
  if (!report.passed) {
    const blocking = report.findings.filter(item => item.severity === "blocking");
    const flagged = new Set(blocking.map(item => item.target).filter(target => graph.claims.some(claim => claim.id === target)));
    const manifest = safeManifest(graph, input, `policy:${[...new Set(blocking.map(item => item.rule))].join(",")}`, flagged);
    return { manifest, report: validateManifest(manifest, withholdClaims(graph, flagged), input.policy), fallback: true, rejected: report };
  }
  const manifest = { ...parsed.data, compiler: { ...parsed.data.compiler, policy: { passed: true, blocking: 0, findings: report.findings.length } } };
  return { manifest, report, fallback: false, rejected: null };
}

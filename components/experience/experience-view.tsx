import { ExternalLink, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateRu, weakestVerification } from "@/lib/agents/format";
import type { AgentResultView, AgentRun, RunExperience } from "@/lib/agents/types";
import type { EvidenceGraph, GraphDocument, NormalizedClaim, SourceOutcome } from "@/lib/mesh/evidence";
import { graphIndex } from "@/lib/mesh/evidence-graph";
import { applyView, viewLabel } from "@/lib/mesh/refine";
import type { ManifestModule, ModuleFamily } from "@/lib/mesh/manifest";
import type { SourceStatus } from "@/lib/mesh/sources";
import type { CapabilityState } from "@/lib/portal/cards";
import type { PortalJob } from "@/lib/portal/jobs";
import { DRUGS, latinTermsIn } from "@/lib/portal/lexicon";
import { SUGGESTIONS } from "@/lib/portal/suggestions";
import { runOutcome } from "@/lib/portal/run-outcome";
import { unmatchedWords } from "@/lib/portal/unmatched";
import { CERTAINTY_LABEL, certaintyOf, DRUG_SECTION_ORDER, DRUG_SECTION_TITLE, drugSectionGroup, editorialVerification, isRussian, localizeItem, physicianSafe, type Certainty, type DrugSectionGroup } from "@/lib/presentation/physician";
import { nbsp } from "@/lib/ui/typography";
import { StateBadge } from "@/components/portal/for-you";
import { FollowupJobButton, ResetViewButton, SaveResultButton } from "@/components/portal/result-actions";
import { TrackedLink } from "@/components/portal/tracked-link";

/**
 * Deterministic renderer of an ExperienceManifest. Every module family maps
 * to approved, existing components; every visible statement is resolved
 * from the evidence graph by id. The renderer never composes medical text:
 * Russian source text is quoted as is; text in another language is kept
 * behind «Показать оригинал» under a fixed Russian description of what it is.
 * Internal verification notes are never shown — only editorial labels.
 */

type Index = ReturnType<typeof graphIndex>;

interface Ctx {
  run: AgentRun;
  graph: EvidenceGraph;
  index: Index;
  job: PortalJob;
  resultFor: (documentId: string, module: ManifestModule) => AgentResultView | null;
  /** The question named instruction sections: studies about the drug are secondary and start closed. */
  sectionQuestion: boolean;
  /** Documents whose conclusion is already the main answer: not repeated in the list below it. */
  inTakeaway: ReadonlySet<string>;
  /** Statements already shown in «Коротко»: never printed a second time in another module. */
  takeawayClaims: ReadonlySet<string>;
  /** Instruction sections the question named, and whether it opened as a version comparison (part of «Искали по»). */
  askedSections: readonly string[];
  comparison: boolean;
}

/** Section headings as the physician reads them, per result family. */
function heading(entry: ManifestModule, job: PortalJob): string {
  switch (entry.family) {
    case "key_takeaway": return "Коротко";
    // «Что изменилось» only when a comparison was asked for; otherwise these are the versions found.
    case "recommendation_delta": return entry.props.comparison ? "Что изменилось · версии рекомендаций" : "Версии рекомендаций";
    case "conflict": return "Расхождения между источниками";
    case "drug_reference": return "Инструкция по применению";
    case "evidence": return job === "guidelines" ? "Доказательства" : job === "drug" ? "Исследования и обзоры" : "Исследования";
    case "sources": return "Источники";
    default: return entry.title;
  }
}

/** Dates are shown at the precision the source has: a year, a month or a day. */
function date(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}$/u.test(value)) return value;
  if (/^\d{4}-\d{2}$/u.test(value)) return formatDateRu(`${value}-15`, { month: "long", year: "numeric" }) ?? value;
  return formatDateRu(value, { day: "numeric", month: "long", year: "numeric" }) ?? value;
}

/** The version date, unless the label or the source line already says it. */
function versionDate(document: GraphDocument, shown: string): string | null {
  const value = document.version.date;
  if (!value || document.version.label?.includes(value.slice(0, 4))) return null;
  if (/^\d{4}$/u.test(value) && shown.includes(value)) return null;
  return date(value);
}

function freshnessState(graph: EvidenceGraph, document: GraphDocument): { state: CapabilityState; label: string } {
  const freshness = graph.freshness.find(item => item.documentId === document.id);
  const retrieved = formatDateRu(document.retrievedAt, { day: "numeric", month: "short", year: "numeric" }) ?? document.retrievedAt.slice(0, 10);
  const base = document.state === "SNAPSHOT" ? `снимок от ${retrieved}` : `получено ${retrieved}`;
  // The page was read; what is uncertain is the document's currentness — said in words, not as a failed state.
  if (freshness?.state === "revision_overdue") return { state: document.state, label: `${base} · пересмотр документа просрочен` };
  if (freshness?.state === "needs_reverification") return { state: document.state, label: `${base} · версия требует проверки` };
  return { state: document.state, label: base };
}

function sourceName(document: GraphDocument): string {
  if (document.sourceId === "medi") return "МЕДИ РУ";
  if (document.sourceId === "pubmed") return [document.attributes.journal, document.attributes.year].filter(Boolean).join(" · ") || "PubMed";
  if (document.sourceId === "openfda") return "FDA (США)";
  return document.publisher ?? document.title;
}

function studyType(document: GraphDocument): string {
  if (typeof document.attributes.studyType === "string") return document.attributes.studyType;
  if (document.kind === "guideline" || document.kind === "guideline_publication") return "Рекомендации";
  return "Публикация";
}

/** Russian display title of a document; the source title goes to «Оригинал». */
function documentTitle(document: GraphDocument): { title: string; original: string | null } {
  if (isRussian(document.title)) return { title: document.title, original: null };
  // No topic is passed: a document found for a question is not claimed to be about it.
  const localized = localizeItem({ title: document.title, typeLabel: studyType(document) });
  return { title: localized.basis === "template" ? `${studyType(document)} · ${sourceName(document)}` : localized.title, original: document.title };
}

function VerificationTag({ status, note = null }: { status: NormalizedClaim["verification"]; note?: string | null }) {
  const label = editorialVerification(status);
  // «Требует сверки» says what exactly was not checked (first reason, physician wording only).
  const parts = (note ?? "").split(/\.\s+/u).map(part => part.trim()).filter(part => part && !/^Перевод (?:дословной цитаты|фрагмента страницы)/u.test(part));
  const first = parts.find(part => !/совпадает с источником не полностью/iu.test(part)) ?? (parts.length ? "текст совпадает с источником не полностью" : null);
  const reason = label.tone === "supported" ? null : physicianSafe(first);
  return <>
    <span className={`ws-verify ws-verify-${label.tone === "supported" ? "supported" : "partial"}`}>{label.label}</span>
    {reason && <span className="pt-verify-why">{nbsp(reason.replace(/\.$/u, "").replace(/^Не в белом списке врачей/u, "не в списке, проверенном врачами"))}</span>}
  </>;
}

function CertaintyTag({ certainty }: { certainty: Certainty }) {
  return <span className="pt-certainty" data-certainty={certainty}>Уверенность авторов: {CERTAINTY_LABEL[certainty]}</span>;
}

/**
 * Fixed Russian description of what an original-language passage is. In the
 * summary it names the document (or the label section) so that several
 * passages never read as the same line.
 */
function originalLead(claim: NormalizedClaim, document: GraphDocument | undefined, ctx: Ctx, named: boolean): string {
  const heading = claim.chunkId ? ctx.index.chunk.get(claim.chunkId)?.heading : undefined;
  if (document?.sourceId === "openfda") return heading && isRussian(heading) ? `Раздел «${heading}» официальной инструкции FDA — текст на английском.` : "Раздел официальной инструкции FDA — текст на английском.";
  const what = claim.kind === "review_conclusion" ? "Вывод авторов" : claim.kind === "guideline_statement" || claim.kind === "society_assertion" ? "Положение рекомендаций" : "Текст источника";
  if (named && document) return `${documentTitle(document).title}. ${what} — на языке оригинала.`;
  return `${what} — на языке оригинала.`;
}

function Original({ children, label = "Показать оригинал" }: { children: ReactNode; label?: string }) {
  return <details className="pt-original">
    <summary>{label}</summary>
    <div className="pt-original-body" lang="en">{children}</div>
  </details>;
}

/** The original-language text of a claim, or null when the claim reads in Russian. */
function originalText(claim: NormalizedClaim): string | null {
  if (claim.method === "verbatim") return claim.language !== "ru" ? claim.statement : null;
  const statement = physicianSafe(claim.statement);
  return statement && !isRussian(statement) ? statement : null;
}

/**
 * One «Оригинал» per document: the source title and every original-language
 * passage shown for it, instead of a disclosure per line.
 */
function DocumentOriginal({ title, claims }: { title: string | null; claims: readonly NormalizedClaim[] }) {
  const texts = claims.map(claim => ({ id: claim.id, text: originalText(claim), language: claim.language })).filter((item): item is { id: string; text: string; language: NormalizedClaim["language"] } => Boolean(item.text));
  if (!title && !texts.length) return null;
  return <Original label="Оригинал">
    {title && <p className="pt-original-title">{title}</p>}
    {texts.map(item => <blockquote key={item.id} className="pt-quote" lang={item.language}><p>{item.text}</p></blockquote>)}
  </Original>;
}

function Claim({ claim, ctx, named = false, grouped = false, open = false }: { claim: NormalizedClaim; ctx: Ctx; named?: boolean; grouped?: boolean; open?: boolean }) {
  const document = ctx.index.document.get(claim.documentId);
  if (claim.method === "verbatim" && claim.language !== "ru") {
    const certainty = claim.kind === "review_conclusion" || document?.sourceId === "pubmed" ? certaintyOf(claim.statement) : null;
    // In the main answer the authors' own words are the answer: shown, not hidden behind a click (no translation is claimed).
    if (open) return <div className="pt-claim" data-language="original" data-open="true">
      <p className="pt-derived">{nbsp(originalLead(claim, document, ctx, named).replace(" — на языке оригинала.", " (на английском, дословно):"))}{certainty && <> <CertaintyTag certainty={certainty} /></>}</p>
      <blockquote className="pt-quote" lang={claim.language}><p>{claim.statement}</p></blockquote>
    </div>;
    return <div className="pt-claim" data-language="original">
      <p className="pt-derived">{nbsp(originalLead(claim, document, ctx, named))}{certainty && <> <CertaintyTag certainty={certainty} /></>}</p>
      {!grouped && <Original><blockquote className="pt-quote" lang={claim.language}><p>{claim.statement}</p></blockquote></Original>}
    </div>;
  }
  if (claim.method === "verbatim") {
    return <div className="pt-claim">
      <blockquote className="pt-quote" lang="ru"><p>{nbsp(claim.statement)}</p></blockquote>
    </div>;
  }
  const statement = physicianSafe(claim.statement);
  if (!statement) return null;
  return <div className="pt-claim">
    <p className="pt-derived">{isRussian(statement) ? nbsp(statement) : nbsp("Данные источника — на языке оригинала.")}</p>
    {!isRussian(statement) && !grouped && <Original><p>{statement}</p></Original>}
  </div>;
}

function Section({ module: entry, ctx, children, className }: { module: ManifestModule; ctx: Ctx; children: ReactNode; className?: string }) {
  const id = `exp-${entry.id}`;
  return <section className={`ws-section pt-module${className ? ` ${className}` : ""}`} aria-labelledby={id} data-module={entry.family}>
    <h2 id={id} className="pt-subtitle">{nbsp(heading(entry, ctx.job))}</h2>
    {children}
  </section>;
}

/** Societies whose own guideline snapshot answered («ESC»): their name in the question was used. */
function societiesIn(graph: EvidenceGraph): Set<string> {
  return new Set(graph.documents.flatMap(document => [document.attributes.society, document.publisher]).filter((name): name is string => typeof name === "string")
    .flatMap(name => name.match(/[A-Za-z]{2,}/gu) ?? []).map(name => name.toLowerCase()));
}

function Gaps({ graph }: { graph: EvidenceGraph }) {
  const drugs = graph.context.drugs.length > 0;
  const guidelines = graph.family === "guidelines" || graph.documents.some(document => document.kind === "guideline");
  const gaps = graph.gaps.map(physicianSafe).filter((gap): gap is string => Boolean(gap));
  return <>
    {gaps.length > 0 && <p>{nbsp(`Чего не хватает: ${gaps.join("; ")}.`)}</p>}
    {drugs && <p>{nbsp("Официальный статус регистрации и инструкции в России проверяйте в ГРЛС.")}</p>}
    {guidelines && <p>{nbsp("Действующую версию клинических рекомендаций проверяйте в рубрикаторе Минздрава.")}</p>}
  </>;
}

/**
 * What the search used, and the words of the question it did not («Не учтено в поиске: сниженной функцией почек»):
 * a dropped condition is named, never left for the physician to work out.
 */
function SearchConditions({ ctx }: { ctx: Ctx }) {
  // Asked instruction sections count as conditions only where the instruction has them; missing ones are said.
  const present = new Set(ctx.graph.claims.flatMap(claim => {
    const document = ctx.index.document.get(claim.documentId);
    if (!document || (document.kind !== "drug_instruction" && document.kind !== "drug_label")) return [];
    return [drugSectionGroup(claim.chunkId ? ctx.index.chunk.get(claim.chunkId)?.heading : undefined)];
  }));
  const asked = ctx.askedSections.filter((group): group is DrugSectionGroup => (DRUG_SECTION_ORDER as readonly string[]).includes(group));
  const base = ctx.graph.context.conditions ?? [];
  const sectionLabel = (group: DrugSectionGroup) => DRUG_SECTION_TITLE[group].toLocaleLowerCase("ru-RU");
  const conditions = [
    ...base,
    ...asked.filter(group => present.has(group) && !base.includes(sectionLabel(group))).map(group => `раздел «${sectionLabel(group)}»`),
    ...(ctx.comparison ? ["что изменилось между версиями"] : []),
  ];
  const absent = asked.filter(group => !present.has(group));
  // One instruction is opened per answer: the other drugs of the question are named, never implied.
  const instructions = ctx.graph.documents.filter(document => document.kind === "drug_instruction" || document.kind === "drug_label");
  const opened = new Set(instructions.map(document => String(document.attributes.inn ?? document.attributes.genericName ?? "").toLowerCase()).filter(Boolean));
  const notOpened = instructions.length ? ctx.graph.context.drugs.filter(inn => !opened.has(inn.toLowerCase())).map(inn => DRUGS.find(drug => drug.inn === inn)?.ru ?? inn) : [];
  const continuation = ctx.run.input.continuation;
  const question = continuation ? `${continuation.question} ${continuation.steps?.join(" ") ?? ""} ${continuation.followup}` : ctx.run.input.text ?? "";
  // Latin counts as searched only when PubMed ran, and only the words the home query takes (three letters and more).
  const pubmedRan = ctx.graph.sources.some(source => source.id === "pubmed" && source.invoked && (source.outcome === "ok" || source.outcome === "empty"));
  const missing = unmatchedWords(question, conditions, ctx.run.specialty, undefined, { latinSearched: pubmedRan, latinQueried: new Set(latinTermsIn(question)), societies: societiesIn(ctx.graph) });
  // Nothing recognised: the line still names the words the search did not use («AF» in «Management of AF in elderly»).
  if (!conditions.length) return missing.length ? <p className="ws-muted pt-search-conditions" data-conditions={0} data-missing={missing.length}><strong>{nbsp(`Тему вопроса не распознали. Не учтено в поиске: ${missing.map(phrase => `«${phrase}»`).join(", ")}.`)}</strong></p> : null;
  return <p className="ws-muted pt-search-conditions" data-conditions={conditions.length} data-missing={missing.length || undefined}>
    {nbsp(`Искали по: ${conditions.join(" · ")}.`)}
    {missing.length > 0 && <> <strong>{nbsp(`Не учтено в поиске: ${missing.map(phrase => `«${phrase}»`).join(", ")}.`)}</strong> {nbsp("Проверьте это по выводам ниже.")}</>}
    {notOpened.length > 0 && <> {nbsp(`Инструкция открыта только для препарата «${instructions[0].title.split(/[,(]/u)[0].trim()}»; ${notOpened.map(name => `«${name}»`).join(", ")} — смотрите ${notOpened.length > 1 ? "их инструкции" : "его инструкцию"} в ГРЛС.`)}</>}
    {absent.length > 0 && <> {nbsp(`${absent.length > 1 ? "Разделы" : "Раздел"} ${absent.map(group => `«${sectionLabel(group)}»`).join(" и ")} в этот ответ не ${absent.length > 1 ? "вошли" : "вошёл"} — смотрите полную инструкцию по ссылке ниже и в ГРЛС.`)}</>}
  </p>;
}

/** A publication whose read conclusion never names the asked disease is off the question, whatever the search matched. */
function offTopic(document: GraphDocument, ctx: Pick<Ctx, "graph">): boolean {
  const nosology = ctx.graph.context.nosology;
  if (!nosology || document.attributes.questionMatch === undefined) return false;
  const claims = ctx.graph.claims.filter(claim => claim.documentId === document.id && claim.kind === "review_conclusion");
  return claims.length > 0 && !claims.some(claim => claim.entityIds.includes(`nosology:${nosology}`));
}

/** Whether a publication answers the question as asked — separate from whether its text was matched. */
function RelevanceTag({ document, ctx }: { document: GraphDocument; ctx?: Pick<Ctx, "graph"> }) {
  if (ctx && offTopic(document, ctx)) return <span className="pt-relevance" data-relevance="partial">Тема вопроса в выводе не названа</span>;
  if (document.attributes.questionMatch === "partial") return <span className="pt-relevance" data-relevance="partial">{nbsp(`Шире вопроса${document.attributes.unmatchedConditions ? `: без условия «${document.attributes.unmatchedConditions}»` : ""}`)}</span>;
  // Found by the search conditions listed above the answer — not a judgement that the work answers the question.
  if (document.attributes.questionMatch === "all_conditions") return <span className="pt-relevance" data-relevance="all">По условиям поиска</span>;
  return null;
}

function KeyTakeaway({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const id = `exp-${entry.id}`;
  const unmatched = typeof entry.props.unmatched === "string" ? entry.props.unmatched : null;
  if (entry.props.noDirectAnswer) {
    return <section className="pt-synthesis pt-takeaway" aria-labelledby={id} data-module="key_takeaway" data-answer="none">
      <h2 id={id} className="pt-subtitle">Прямого ответа не нашлось</h2>
      <p>{nbsp(unmatched
        ? `В PubMed нет обзоров и рекомендаций за последние годы, где были бы все условия вопроса — не хватает: ${unmatched}. Найденные работы шире вопроса и на него напрямую не отвечают; они ниже, в разделе «Шире вопроса».`
        : "В выводах найденных обзоров нет прямого ответа на то, что спрошено, поэтому главного вывода нет. Работы — ниже, как есть; уточните вопрос, если нужен прямой ответ.")}</p>
      <SearchConditions ctx={ctx} />
      <Gaps graph={ctx.graph} />
    </section>;
  }
  const widened = Number(entry.props.widened ?? 0);
  return <section className="pt-synthesis pt-takeaway" aria-labelledby={id} data-module="key_takeaway" data-answer="direct">
    <h2 id={id} className="pt-subtitle">{nbsp(heading(entry, ctx.job))}</h2>
    <SearchConditions ctx={ctx} />
    <ol className="pt-takeaway-list">
      {entry.claimIds.map(claimId => {
        const claim = ctx.index.claim.get(claimId);
        const document = claim ? ctx.index.document.get(claim.documentId) : undefined;
        if (!claim || !document) return null;
        const source = sourceName(document);
        const version = versionDate(document, source);
        // An instruction excerpt names its section and says when the section was shortened.
        const chunk = claim.chunkId ? ctx.index.chunk.get(claim.chunkId) : undefined;
        const instruction = document.kind === "drug_instruction" || document.kind === "drug_label";
        const section = instruction ? DRUG_SECTION_TITLE[drugSectionGroup(chunk?.heading)] : null;
        // Each instruction excerpt names its product: a dose rule of one anticoagulant is never read as another's.
        const product = instruction ? document.title.split(/[,(]/u)[0].trim() : null;
        return <li key={claimId}>
          <p className="pt-takeaway-source">{nbsp(`${section ? `${section} · ` : ""}${product ? `${product} · ` : ""}${source}${document.version.label ? ` · ${document.version.label}` : ""}${version ? ` · ${version}` : ""}`)} <RelevanceTag document={document} ctx={ctx} /> <VerificationTag status={claim.verification} note={claim.verificationNote} /></p>
          <Claim claim={claim} ctx={ctx} named open={claim.kind === "review_conclusion"} />
          {instruction && chunk?.truncated && <p className="ws-muted" data-truncated="true">{nbsp("Раздел сокращён — полный текст в инструкции по ссылке ниже и в ГРЛС.")}</p>}
          {document.sourceId === "pubmed" && <TrackedLink className="pt-source-link" href={document.url} external events={["source_opened"]}>Открыть в PubMed<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
        </li>;
      })}
    </ol>
    {widened > 0 && <p className="ws-muted" data-widened={widened}>{nbsp(`Ещё ${widened} — шире вопроса${unmatched ? ` (найдены без условия «${unmatched}»)` : ""}: они ниже, в «Шире вопроса», и в этот вывод не вошли.`)}</p>}
    <Gaps graph={ctx.graph} />
  </section>;
}

function DocumentActions({ document, result, label }: { document: GraphDocument; result: AgentResultView | null; label?: string }) {
  const internal = typeof document.attributes.internalHref === "string" ? document.attributes.internalHref : null;
  return <div className="pt-card-actions">
    {internal
      ? <TrackedLink className="ws-button is-small" href={internal} events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>Открыть</TrackedLink>
      : <TrackedLink className="ws-button is-small" href={document.url} external events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>{label ?? "Открыть первоисточник"}<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
    {result && <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />}
  </div>;
}

/** A refinement «раскрой источник»: every claim and excerpt the graph keeps for that document. */
function Expanded({ documentId, shown, ctx }: { documentId: string; shown: ReadonlySet<string>; ctx: Ctx }) {
  const extra = ctx.graph.claims.filter(claim => claim.documentId === documentId && !shown.has(claim.id));
  const chunks = ctx.graph.chunks.filter(chunk => chunk.documentId === documentId && chunk.text && !extra.some(claim => claim.chunkId === chunk.id) && !ctx.graph.claims.some(claim => shown.has(claim.id) && claim.chunkId === chunk.id));
  if (!extra.length && !chunks.length) return <p className="ws-muted" data-expanded="true">{nbsp("Всё, что сохранено из этого источника, уже показано. Полный текст — по ссылке на источник.")}</p>;
  const language = ctx.index.document.get(documentId)?.language ?? "ru";
  return <div className="pt-expanded" data-expanded="true">
    {extra.map(claim => <Claim key={claim.id} claim={claim} ctx={ctx} />)}
    {chunks.slice(0, 6).map(chunk => <div key={chunk.id}><h4>{nbsp(chunk.heading)}</h4>{language === "ru" ? <p>{chunk.text}</p> : <Original><p>{chunk.text}</p></Original>}</div>)}
  </div>;
}

function RecommendationDelta({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const claims = new Set(entry.claimIds);
  const comparison = typeof entry.props.comparison === "string" ? entry.props.comparison : null;
  const changed = new Set(Array.isArray(entry.props.changedClaimIds) ? entry.props.changedClaimIds : []);
  const changedDocument = typeof entry.props.changedDocumentId === "string" ? entry.props.changedDocumentId : null;
  const previous = typeof entry.props.previousVersion === "string" ? entry.props.previousVersion : null;
  const expanded = typeof entry.props.expandedDocumentId === "string" ? entry.props.expandedDocumentId : null;
  return <Section module={entry} ctx={ctx}>
    {comparison === "current_state" && <p className="pt-version-note" data-comparison="current_state">{typeof entry.props.hiddenPreviousVersion === "string"
      ? nbsp(`В показанных источниках предыдущая версия не указана — показано текущее состояние и срок пересмотра. Предыдущую версию (${entry.props.hiddenPreviousVersion}) называет ${entry.props.hiddenBy === "jurisdiction" ? "международный источник, скрытый фильтром «только российские источники»" : "документ, скрытый фильтром по году"}.`)
      : nbsp("Предыдущая версия в найденных источниках не указана — показано текущее состояние документов и срок их пересмотра.")}</p>}
    <ol className="pt-versions">
      {entry.documentIds.map(documentId => {
        const document = ctx.index.document.get(documentId);
        if (!document) return null;
        const fresh = freshnessState(ctx.graph, document);
        const all = ctx.graph.claims.filter(claim => claim.documentId === documentId && claims.has(claim.id));
        // Statements already in «Коротко» are not printed again under the version.
        const docClaims = all.filter(claim => !ctx.takeawayClaims.has(claim.id));
        const kind = document.kind === "society_guideline_summary" ? "Рекомендации общества" : document.kind === "guideline_publication" ? "Публикация рекомендаций" : document.jurisdiction === "RU" ? "Российские рекомендации" : "Рекомендации";
        const title = documentTitle(document);
        const practical = docClaims.filter(claim => changed.has(claim.id) || claim.kind === "guideline_statement" || claim.kind === "society_assertion");
        return <li key={documentId} className="pt-version">
          <div className="ws-result-meta">
            <span className="ws-kind" data-art="guideline">{kind}</span>
            {document.version.label && <span>{document.version.label}</span>}
            {versionDate(document, "") && <span>{versionDate(document, "")}</span>}
          </div>
          <h3 className="pt-version-title">{nbsp(title.title)}</h3>
          <p className="ws-provenance"><span>{document.publisher ?? sourceName(document)}</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
          {comparison === "previous_version" && previous && documentId === changedDocument && <p className="pt-version-note" data-comparison="previous_version">{nbsp(`Предыдущая версия: ${previous}. Ниже — что изменилось, по обзору публикации.`)}</p>}
          {docClaims.length < all.length && <p className="ws-muted" data-in-takeaway={all.length - docClaims.length}>{nbsp(docClaims.length ? "Часть положений — выше, в «Коротко»." : "Положения этой версии — выше, в «Коротко».")}</p>}
          {practical.length > 0 && <p className="pt-practice-label">Что это значит для практики</p>}
          {docClaims.map(claim => <div key={claim.id}>{changed.has(claim.id) && comparison === "previous_version" && <span className="pt-change-tag">Изменение</span>}<Claim claim={claim} ctx={ctx} grouped /></div>)}
          <DocumentOriginal title={title.original} claims={docClaims} />
          {expanded === documentId && <Expanded documentId={documentId} shown={claims} ctx={ctx} />}
          <DocumentActions document={document} result={ctx.resultFor(documentId, entry)} />
        </li>;
      })}
    </ol>
  </Section>;
}

function Conflicts({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const ids = Array.isArray(entry.props.conflictIds) ? entry.props.conflictIds : [];
  return <Section module={entry} ctx={ctx} className="pt-conflicts">
    <p className="ws-muted">{nbsp("Продукт не решает, какой источник прав: сверьте даты, юрисдикцию и статус документов.")}</p>
    {ctx.graph.conflicts.filter(conflict => ids.includes(conflict.id)).map(conflict => <div key={conflict.id} className="pt-conflict">
      <p className="pt-conflict-why">{nbsp(physicianSafe(conflict.explanation) ?? "Источники говорят о разном")}</p>
      <div className="pt-conflict-sides">
        {conflict.claimIds.map(claimId => {
          const claim = ctx.index.claim.get(claimId);
          const document = claim ? ctx.index.document.get(claim.documentId) : undefined;
          if (!claim || !document) return null;
          return <div key={claimId} className="pt-conflict-side">
            <p className="pt-takeaway-source">{nbsp(`${sourceName(document)} · ${documentTitle(document).title}${document.version.date ? ` · ${document.version.date.slice(0, 4)}` : ""}`)}</p>
            <Claim claim={claim} ctx={ctx} />
          </div>;
        })}
      </div>
    </div>)}
  </Section>;
}

function DrugSection({ group, claims: all, headingId, ctx }: { group: DrugSectionGroup; claims: readonly NormalizedClaim[]; headingId: string; ctx: Ctx }) {
  const claims = all.filter(claim => !ctx.takeawayClaims.has(claim.id));
  return <section id={`${headingId}-${group}`} className="pt-drug-section" aria-label={DRUG_SECTION_TITLE[group]}>
    <h3>{DRUG_SECTION_TITLE[group]}</h3>
    {claims.length < all.length && <p className="ws-muted" data-in-takeaway={all.length - claims.length}>{nbsp(claims.length ? "Часть раздела — выше, в «Коротко»." : "Текст раздела — выше, в «Коротко».")}</p>}
    {claims.map(claim => {
      const chunk = claim.chunkId ? ctx.index.chunk.get(claim.chunkId) : undefined;
      const sub = chunk?.heading && chunk.heading.toLocaleLowerCase("ru-RU") !== DRUG_SECTION_TITLE[group].toLocaleLowerCase("ru-RU") ? chunk.heading : null;
      return <div key={claim.id} className="pt-drug-entry">
        {sub && <p className="pt-drug-sub">{nbsp(sub)}</p>}
        {claim.language === "ru"
          ? <p lang="ru">{nbsp(claim.statement)}</p>
          : <><p className="pt-derived">{nbsp("Раздел официальной инструкции FDA — на английском.")}</p><Original><p>{claim.statement}</p></Original></>}
      </div>;
    })}
  </section>;
}

/** One drug document: key facts first, then the label sections grouped the way a physician looks for them. */
function DrugDocument({ entry, documentId, ctx }: { entry: ManifestModule; documentId: string; ctx: Ctx }) {
  const document = ctx.index.document.get(documentId);
  if (!document) return null;
  const claims = ctx.graph.claims.filter(claim => claim.documentId === documentId && entry.claimIds.includes(claim.id));
  const result = ctx.resultFor(documentId, entry);
  const status = weakestVerification(claims.map(claim => claim.verification));
  const fresh = freshnessState(ctx.graph, document);
  const headingId = `drug-${entry.id}-${documentId.replace(/[^a-z0-9]/giu, "")}`;
  if (document.kind === "inn_listing") {
    return <article className="pt-drug" aria-labelledby={headingId} data-module="drug_reference">
      <h2 className="pt-drug-title" id={headingId}>{nbsp(document.title)}</h2>
      <p className="pt-boundary"><ShieldAlert size={14} aria-hidden="true" />{nbsp("Аналоги содержат одно действующее вещество, но не являются эквивалентной заменой друг другу. Регистрацию проверяйте в ГРЛС.")}</p>
      <ul className="pt-products">{claims.map(claim => <li key={claim.id}>{nbsp(claim.statement)}</li>)}</ul>
      <p className="ws-provenance"><span>МЕДИ РУ</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
      <DocumentActions document={document} result={result} label="Открыть на МЕДИ РУ" />
    </article>;
  }
  const us = document.jurisdiction === "US";
  const groups = new Map<DrugSectionGroup, NormalizedClaim[]>();
  for (const claim of claims) {
    const chunk = claim.chunkId ? ctx.index.chunk.get(claim.chunkId) : undefined;
    const group = drugSectionGroup(chunk?.heading);
    groups.set(group, [...(groups.get(group) ?? []), claim]);
  }
  const present = DRUG_SECTION_ORDER.filter(group => groups.has(group));
  // The sections the question named come first and open; the rest of the instruction is one click away.
  const asked = Array.isArray(entry.props.asked) ? entry.props.asked.filter((group): group is DrugSectionGroup => (DRUG_SECTION_ORDER as readonly string[]).includes(group)) : [];
  const shown = asked.length ? present.filter(group => asked.includes(group)) : present;
  const rest = asked.length ? present.filter(group => !asked.includes(group)) : [];
  const english = claims.some(claim => claim.language !== "ru");
  const registration = typeof document.attributes.registration === "string" ? document.attributes.registration : null;
  return <article className="pt-drug" aria-labelledby={headingId} data-module="drug_reference">
    <div className="ws-result-meta">
      <span className="ws-kind" data-art="clinical">{us ? "Инструкция FDA" : "Инструкция по применению"}</span>
      <VerificationTag status={status} />
    </div>
    <h2 className="pt-drug-title" id={headingId}>{nbsp(document.title)}</h2>
    <section className="pt-drug-key" aria-label="Ключевая информация">
      <h3 className="pt-drug-key-title">Ключевая информация</h3>
      <ul>
        <li>{us ? "Официальная инструкция, утверждённая в США (FDA)." : "Копия российской инструкции на сайте МЕДИ РУ (по данным сайта — по ГРЛС)."}</li>
        {registration && <li>{`Регистрационный номер: ${registration}.`}</li>}
        {document.version.date && <li>{`${us ? "Редакция" : "Обновлено на сайте"}: ${date(document.version.date)}`}</li>}
        {present.length > 0 && <li>{`Разделы ниже: ${present.map(group => DRUG_SECTION_TITLE[group].toLocaleLowerCase("ru-RU")).join(", ")}.`}</li>}
        {english && <li>Тексты разделов FDA — на английском; русский текст инструкции и статус регистрации — в ГРЛС.</li>}
      </ul>
    </section>
    <p className="pt-boundary"><ShieldAlert size={14} aria-hidden="true" />{us
      ? "Это инструкция, утверждённая в США. Показания, дозы и ограничения в России определяет инструкция из ГРЛС; openFDA предупреждает, что данные не валидированы. Решение о назначении — за врачом."
      : nbsp("Копия российской инструкции на сайте МЕДИ РУ (по данным сайта — по ГРЛС). Официальный текст и статус регистрации — в ГРЛС. Решение о назначении — за врачом.")}</p>
    {typeof entry.props.focus === "string" && <p className="ws-muted" data-focus={entry.props.focus}>{nbsp("Показаны только разделы инструкции, о которых вы спросили. Остальные — в полной инструкции по ссылке.")}</p>}
    {!asked.length && present.length > 1 && <nav className="pt-drug-nav" aria-label="Разделы инструкции">{present.map(group => <a key={group} href={`#${headingId}-${group}`}>{DRUG_SECTION_TITLE[group]}</a>)}</nav>}
    {asked.length > 0 && !shown.length && <p className="pt-version-note" data-asked-missing="true">{nbsp(`В этой копии инструкции нет раздела «${asked.map(group => DRUG_SECTION_TITLE[group].toLocaleLowerCase("ru-RU")).join("», «")}» — проверьте полный текст по ссылке ниже.`)}</p>}
    <div className="pt-drug-sections">
      {shown.map(group => <DrugSection key={group} group={group} claims={groups.get(group) ?? []} headingId={headingId} ctx={ctx} />)}
    </div>
    {rest.length > 0 && <details className="pt-widened" data-rest-sections={rest.join(",")}>
      <summary>{nbsp(`Другие разделы инструкции: ${rest.map(group => DRUG_SECTION_TITLE[group].toLocaleLowerCase("ru-RU")).join(", ")}`)}</summary>
      <div className="pt-drug-sections">{rest.map(group => <DrugSection key={group} group={group} claims={groups.get(group) ?? []} headingId={headingId} ctx={ctx} />)}</div>
    </details>}
    {entry.props.expandedDocumentId === documentId && <Expanded documentId={documentId} shown={new Set(entry.claimIds)} ctx={ctx} />}
    {claims.some(claim => claim.chunkId && ctx.index.chunk.get(claim.chunkId)?.truncated) && <p className="ws-muted">{nbsp("Длинные разделы сокращены — полный текст по ссылке на источник.")}</p>}
    <p className="ws-provenance"><span>{us ? "Инструкция FDA (openFDA, DailyMed)" : "МЕДИ РУ"}</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
    <div className="pt-card-actions">
      <TrackedLink className="ws-button is-small" href={document.url} external events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>{us ? "Инструкция на DailyMed" : "Инструкция на МЕДИ РУ"}<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
      <TrackedLink className="ws-button is-small" href="https://grls.rosminzdrav.ru/" external events={["source_opened"]}>Проверить в ГРЛС<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
      {result && <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />}
    </div>
  </article>;
}

function DrugReference({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  return <>{entry.documentIds.map(documentId => <DrugDocument key={documentId} entry={entry} documentId={documentId} ctx={ctx} />)}</>;
}

function EvidenceItem({ document, entry, ctx, claims }: { document: GraphDocument; entry: ManifestModule; ctx: Ctx; claims: ReadonlySet<string> }) {
  const docClaims = ctx.graph.claims.filter(claim => claim.documentId === document.id && claims.has(claim.id));
  const result = ctx.resultFor(document.id, entry);
  const title = documentTitle(document);
  return <li className="pt-answer" data-relevance={document.attributes.questionMatch === "partial" ? "partial" : "all"}>
    <div className="ws-result-meta">
      <span className="ws-kind" data-art={document.kind === "guideline_publication" || document.kind === "guideline" ? "guideline" : "article"}>{studyType(document)}</span>
      <span>{sourceName(document)}</span>
      <RelevanceTag document={document} ctx={ctx} />
    </div>
    <h3 className="pt-version-title">{nbsp(title.title)}</h3>
    {docClaims.map(claim => <Claim key={claim.id} claim={claim} ctx={ctx} grouped />)}
    {entry.props.expandedDocumentId === document.id && <Expanded documentId={document.id} shown={claims} ctx={ctx} />}
    <DocumentOriginal title={title.original} claims={docClaims} />
    <DocumentActions document={document} result={result} label={document.sourceId === "pubmed" ? "Открыть в PubMed" : undefined} />
  </li>;
}

function Evidence({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const claims = new Set(entry.claimIds);
  const all = entry.documentIds.map(id => ctx.index.document.get(id)).filter((document): document is GraphDocument => Boolean(document));
  // Publications from a widened search are kept apart and closed: they are context, not evidence for the answer.
  // A work whose conclusion is the main answer is not listed again; the list says how many it leaves out.
  const aside = (document: GraphDocument) => document.attributes.questionMatch === "partial" || offTopic(document, ctx);
  const repeated = all.filter(document => ctx.inTakeaway.has(document.id) && !aside(document));
  const documents = all.filter(document => !aside(document) && !ctx.inTakeaway.has(document.id));
  const widened = all.filter(aside);
  // Everything is already in «Коротко»: no section that only says so.
  if (!documents.length && !widened.length && !ctx.sectionQuestion) return null;
  if (ctx.sectionQuestion) return <details className="pt-widened" data-module="evidence" data-secondary="true">
    <summary>{nbsp(`${heading(entry, ctx.job)} · ${all.length}`)}</summary>
    {documents.length + repeated.length > 0 && <ol className="pt-answers">{[...repeated, ...documents].map(document => <EvidenceItem key={document.id} document={document} entry={entry} ctx={ctx} claims={claims} />)}</ol>}
    {widened.length > 0 && <><h3 className="pt-widened-title">{nbsp(`Шире вопроса · ${widened.length}`)}</h3><ol className="pt-answers">{widened.map(document => <EvidenceItem key={document.id} document={document} entry={entry} ctx={ctx} claims={claims} />)}</ol></>}
  </details>;
  const certainties = documents.flatMap(document => ctx.graph.claims.filter(claim => claim.documentId === document.id && claims.has(claim.id))).map(claim => claim.language !== "ru" ? certaintyOf(claim.statement) : null).filter((value): value is Certainty => Boolean(value));
  const counts = (["high", "moderate", "low", "very_low"] as const).map(level => [level, certainties.filter(item => item === level).length] as const).filter(([, count]) => count > 0);
  return <Section module={entry} ctx={ctx}>
    {counts.length > 0 && <div className="pt-quality" data-quality="authors">
      <p className="pt-quality-title">Качество доказательств</p>
      <p className="ws-muted">{nbsp(`По формулировкам авторов: ${counts.map(([level, count]) => `${CERTAINTY_LABEL[level]} — ${count}`).join(", ")}. Оценка — слова самих авторов, продукт её не меняет.`)}</p>
    </div>}
    {repeated.length > 0 && <p className="ws-muted" data-in-takeaway={repeated.length}>{nbsp(`Работы, чьи выводы уже в «Коротко» выше (${repeated.length}), здесь не повторяются.`)}</p>}
    {documents.length > 0 && <ol className="pt-answers">{documents.map(document => <EvidenceItem key={document.id} document={document} entry={entry} ctx={ctx} claims={claims} />)}</ol>}
    {widened.length > 0 && <details className="pt-widened" data-widened={widened.length} open={!documents.length || undefined}>
      <summary>{nbsp(`Шире вопроса · ${widened.length}`)}</summary>
      <p className="ws-muted">{nbsp("Эти работы найдены без части условий вопроса или не называют его тему в выводе. На заданный вопрос они напрямую не отвечают.")}</p>
      <ol className="pt-answers">{widened.map(document => <EvidenceItem key={document.id} document={document} entry={entry} ctx={ctx} claims={claims} />)}</ol>
    </details>}
  </Section>;
}

const STATUS_LABEL: Record<SourceStatus, string> = { LIVE: "Онлайн", LIMITED: "Онлайн", SNAPSHOT: "Снимок редакции", HANDOFF: "Проверка по ссылке", UNAVAILABLE: "Недоступно" };
const OUTCOME_LABEL: Record<SourceOutcome | "not_invoked" | "pending", string> = { ok: "нашлось", empty: "ничего не нашлось", failed: "временно недоступен", unavailable: "временно недоступен", handoff: "проверьте по ссылке", blocked: "остановлено", not_invoked: "не понадобился", pending: "проверяется" };

function Sources({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const ids = new Set(Array.isArray(entry.props.sourceIds) ? entry.props.sourceIds : []);
  const rows = ctx.graph.sources.filter(source => ids.has(source.id));
  const unique = rows.filter((row, index) => rows.findIndex(other => other.id === row.id) === index);
  return <details className="ws-trace-disclosure" data-module="sources">
    <summary>{heading(entry, ctx.job)}</summary>
    <ul className="pt-source-states">
      {unique.map(source => {
        const outcomes = rows.filter(row => row.id === source.id).map(row => row.outcome);
        const outcome = outcomes.includes("ok") ? "ok" : outcomes[0];
        const count = ctx.graph.documents.filter(document => document.sourceId === source.id).length;
        // A page that changed its structure is not «временно недоступен»: a repeat will not help until it is fixed.
        const changed = (outcome === "failed" || outcome === "unavailable") && ctx.graph.gaps.some(gap => gap.includes(source.name.split(" (")[0]) && /изменилась/iu.test(gap));
        return <li key={source.id}>
          <span>{source.name}</span>
          <span className="ws-mode pt-state" data-state={source.status === "LIMITED" ? "LIVE" : source.status}>{STATUS_LABEL[source.status]}</span>
          <span className="ws-muted">{changed ? "страница изменилась — сейчас не читается" : OUTCOME_LABEL[outcome]}{outcome === "ok" && count ? `: ${count}` : ""}</span>
        </li>;
      })}
    </ul>
  </details>;
}

function Handoff({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const ids = new Set(Array.isArray(entry.props.sourceIds) ? entry.props.sourceIds : []);
  return <>
    {ids.has("minzdrav_rubricator") && <aside className="pt-boundary-block" aria-label="Статус рекомендаций в России" data-module="handoff">
      <p>{nbsp("Статус в России · Рубрикатор клинических рекомендаций Минздрава пока не подключён, поэтому официальный статус документов здесь не утверждается.")}</p>
      <TrackedLink className="ws-text-link" href="https://cr.minzdrav.gov.ru/" external events={["source_opened"]}>Открыть рубрикатор<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
    </aside>}
    {ids.has("grls") && <aside className="pt-boundary-block" aria-label="Статус препарата в России" data-module="handoff">
      <p>{nbsp("Статус в России · ГРЛС пока не подключён: регистрация и официальный текст инструкции проверяются по ссылке.")}</p>
      <TrackedLink className="ws-text-link" href="https://grls.rosminzdrav.ru/" external events={["source_opened"]}>Открыть ГРЛС<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
    </aside>}
    {ids.has("medi") && ctx.graph.sources.some(source => source.id === "medi" && source.outcome === "handoff") && <aside className="pt-boundary-block" aria-label="Статьи на русском" data-module="handoff">
      <p>{nbsp("Поиск статей на МЕДИ РУ закрыт для автоматического доступа — откройте сайт и найдите статью сами.")}</p>
      <TrackedLink className="ws-text-link" href="https://medi.ru/" external events={["source_opened"]}>Открыть МЕДИ РУ<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
    </aside>}
  </>;
}

function NextActions({ ctx }: { ctx: Ctx }) {
  const text = ctx.run.input.text?.trim();
  const actions = (ctx.run.experience?.manifest.actions ?? []).filter(action => (action.kind === "follow_up" || action.kind === "investigate_deeper") && action.job);
  if (!text || !actions.length) return null;
  return <section className="pt-next" aria-labelledby="pt-next-title" data-module="next_actions">
    <h2 id="pt-next-title" className="pt-subtitle">Что дальше</h2>
    <div className="pt-card-actions">{actions.slice(0, 3).map(action => <FollowupJobButton key={action.id} text={text} job={action.job as PortalJob} label={action.label} />)}</div>
  </section>;
}

function Notices({ ctx }: { ctx: Ctx }) {
  const examples = SUGGESTIONS[ctx.run.specialty].slice(0, 2).map(item => `«${item}»`).join(" или ");
  // When nothing was searched, the state above says so; this line only helps to ask again (never «не нашлось»).
  const outcome = runOutcome(ctx.run);
  const searched = outcome.kind !== "not_run";
  // Sources excluded in the profile are the whole reason: asking to name a disease would contradict it.
  const excluded = outcome.kind === "not_run" && /исключены в вашем профиле/u.test(outcome.note ?? "");
  // The question named a disease, drug or topic: asking to name one would contradict it.
  const named = (ctx.graph.context.conditions ?? []).length > 0;
  return <div className="pt-synthesis" data-module="notices">
    {!ctx.graph.documents.length && !excluded && outcome.kind !== "source_error" && <p>{nbsp(named ? "Подходящих источников не нашлось." : `${searched ? "Подходящих источников не нашлось. " : ""}Назовите заболевание, препарат (МНН) или тему — например, ${examples}.`)}</p>}
    <Gaps graph={ctx.graph} />
  </div>;
}

const RENDERERS: Partial<Record<ModuleFamily, (props: { module: ManifestModule; ctx: Ctx }) => ReactNode>> = {
  key_takeaway: KeyTakeaway,
  recommendation_delta: RecommendationDelta,
  conflict: Conflicts,
  drug_reference: DrugReference,
  evidence: Evidence,
  sources: Sources,
  handoff: Handoff,
  next_actions: ({ ctx }) => <NextActions ctx={ctx} />,
  notices: ({ ctx }) => <Notices ctx={ctx} />,
};

export function ExperienceView({ run, experience, results, job }: { run: AgentRun; experience: RunExperience; results: AgentResultView[]; job?: PortalJob }) {
  // A refinement view withholds documents outside it; nothing is rewritten.
  const graph = applyView(experience.graph, experience.manifest.view);
  const index = graphIndex(graph);
  const byKey = new Map(results.map(result => [result.key, result]));
  const view = viewLabel(experience.manifest.view);
  // The Skill's line is written for the run in progress («Сверяем…»); on a finished answer it says what was done.
  const PAST: Record<string, string> = { "Открываем": "Открыли", "Сверяем": "Сверили", "Сравниваем": "Сравнили" };
  const finished = run.status === "completed" || run.status === "partial";
  const line = experience.manifest.execution?.class === "skill" ? experience.manifest.execution.explanation ?? null : null;
  const explanation = line && finished ? line.replace(/^(Открываем|Сверяем|Сравниваем)/u, verb => PAST[verb] ?? verb) : line;
  const ctx: Ctx = {
    run,
    graph,
    index,
    job: job ?? graph.family,
    sectionQuestion: experience.manifest.modules.some(entry => entry.family === "drug_reference" && Array.isArray(entry.props.asked) && entry.props.asked.length > 0),
    inTakeaway: new Set(experience.manifest.modules.filter(entry => entry.family === "key_takeaway" && !entry.props.noDirectAnswer).flatMap(entry => entry.documentIds)),
    takeawayClaims: new Set(experience.manifest.modules.filter(entry => entry.family === "key_takeaway").flatMap(entry => entry.claimIds)),
    askedSections: experience.manifest.modules.flatMap(entry => entry.family === "drug_reference" && Array.isArray(entry.props.asked) ? entry.props.asked : []),
    comparison: experience.manifest.view?.comparison === "previous_version",
    resultFor: (documentId, entry) => {
      const key = entry.resultKeys.find(item => item.endsWith(`mesh:${documentId}`)) ?? `${run.agentId}:mesh:${documentId}`;
      return byKey.get(key) ?? null;
    },
  };
  return <div className="pt-experience" data-mode={experience.manifest.representation.mode} data-density={experience.manifest.representation.density} data-execution={experience.manifest.execution?.class ?? "dynamic"} data-manifest-version={run.progress?.manifestVersion ?? 0}>
    {explanation && <p className="pt-explanation" data-explanation="skill">{nbsp(explanation)}</p>}
    {view && <p className="pt-view" role="status" data-view="applied">{nbsp(view)}<ResetViewButton runId={run.id} /></p>}
    {run.riskNotices.length > 0 && <ul className="ws-notices">{run.riskNotices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
    {experience.manifest.modules.map(entry => {
      const Renderer = RENDERERS[entry.family];
      return Renderer ? <Renderer key={entry.id} module={entry} ctx={ctx} /> : null;
    })}
  </div>;
}

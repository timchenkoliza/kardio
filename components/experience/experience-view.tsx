import { ExternalLink, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateRu, VERIFICATION_LABEL, weakestVerification } from "@/lib/agents/format";
import type { AgentResultView, AgentRun, RunExperience } from "@/lib/agents/types";
import type { EvidenceGraph, GraphDocument, NormalizedClaim, SourceOutcome } from "@/lib/mesh/evidence";
import { graphIndex } from "@/lib/mesh/evidence-graph";
import type { ManifestModule, ModuleFamily } from "@/lib/mesh/manifest";
import type { SourceStatus } from "@/lib/mesh/sources";
import type { CapabilityState } from "@/lib/portal/cards";
import type { PortalJob } from "@/lib/portal/jobs";
import { nbsp } from "@/lib/ui/typography";
import { StateBadge } from "@/components/portal/for-you";
import { FollowupJobButton, SaveResultButton } from "@/components/portal/result-actions";
import { TrackedLink } from "@/components/portal/tracked-link";

/**
 * Deterministic renderer of an ExperienceManifest. Every module family maps
 * to approved, existing components; every visible statement is resolved
 * from the evidence graph by id. The renderer never composes medical text:
 * besides the source quotes it prints only fixed interface copy.
 */

type Index = ReturnType<typeof graphIndex>;

interface Ctx {
  run: AgentRun;
  graph: EvidenceGraph;
  index: Index;
  resultFor: (documentId: string, module: ManifestModule) => AgentResultView | null;
}

function date(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}$/u.test(value)) return value;
  return formatDateRu(value, { day: "numeric", month: "long", year: "numeric" }) ?? value;
}

function freshnessState(graph: EvidenceGraph, document: GraphDocument): { state: CapabilityState; label: string } {
  const freshness = graph.freshness.find(item => item.documentId === document.id);
  const retrieved = formatDateRu(document.retrievedAt, { day: "numeric", month: "short", year: "numeric" }) ?? document.retrievedAt.slice(0, 10);
  const base = document.state === "SNAPSHOT" ? `снимок от ${retrieved}` : `получено ${retrieved}`;
  // The page was read; what is uncertain is the document's currentness — said in words, not as a failed state.
  if (freshness?.state === "revision_overdue") return { state: document.state, label: `${base} · пересмотр документа просрочен` };
  if (freshness?.state === "needs_reverification") return { state: document.state, label: `${base} · актуальность версии требует проверки` };
  return { state: document.state, label: base };
}

function sourceName(document: GraphDocument): string {
  if (document.sourceId === "medi") return "МЕДИ РУ";
  if (document.sourceId === "pubmed") return [document.attributes.journal, document.attributes.year].filter(Boolean).join(" · ") || "PubMed";
  if (document.sourceId === "openfda") return "FDA (США)";
  return document.publisher ?? document.title;
}

function Claim({ claim, compact = false }: { claim: NormalizedClaim; compact?: boolean }) {
  const verification = VERIFICATION_LABEL[claim.verification];
  const note = compact ? null : claim.verificationNote;
  if (claim.method === "verbatim") {
    return <div className="pt-claim">
      <blockquote className="pt-quote" lang={claim.language}><p>{claim.language === "ru" ? nbsp(claim.statement) : claim.statement}</p></blockquote>
      {note && <p className="ws-evidence-note"><span className={`ws-verify ws-verify-${verification.tone}`}>{verification.label}</span> {note}</p>}
    </div>;
  }
  return <div className="pt-claim">
    <p className="pt-derived">{nbsp(claim.statement)}</p>
    {note && <p className="ws-evidence-note">{note}</p>}
  </div>;
}

function Section({ module: entry, children, className }: { module: ManifestModule; children: ReactNode; className?: string }) {
  const id = `exp-${entry.id}`;
  return <section className={`ws-section${className ? ` ${className}` : ""}`} aria-labelledby={id} data-module={entry.family}>
    <h2 id={id} className="pt-subtitle">{nbsp(entry.title)}</h2>
    {children}
  </section>;
}

function Gaps({ graph }: { graph: EvidenceGraph }) {
  const drugs = graph.context.drugs.length > 0;
  const guidelines = graph.family === "guidelines" || graph.documents.some(document => document.kind === "guideline");
  return <>
    {graph.gaps.length > 0 && <p>{nbsp(`Чего не хватает: ${graph.gaps.join("; ")}.`)}</p>}
    {drugs && <p>{nbsp("Официальный статус регистрации и инструкции в России проверяйте в ГРЛС.")}</p>}
    {guidelines && <p>{nbsp("Действующую версию клинических рекомендаций проверяйте в рубрикаторе Минздрава.")}</p>}
  </>;
}

function KeyTakeaway({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const id = `exp-${entry.id}`;
  return <section className="pt-synthesis pt-takeaway" aria-labelledby={id} data-module="key_takeaway">
    <h2 id={id} className="pt-subtitle">{nbsp(entry.title)}</h2>
    <ol className="pt-takeaway-list">
      {entry.claimIds.map(claimId => {
        const claim = ctx.index.claim.get(claimId);
        const document = claim ? ctx.index.document.get(claim.documentId) : undefined;
        if (!claim || !document) return null;
        return <li key={claimId}>
          <p className="pt-takeaway-source">{nbsp(`${sourceName(document)}${document.version.label ? ` · ${document.version.label}` : ""}${document.version.date && !document.version.label?.includes(document.version.date.slice(0, 4)) ? ` · ${date(document.version.date)}` : ""}`)} <span className={`ws-verify ws-verify-${VERIFICATION_LABEL[claim.verification].tone}`}>{VERIFICATION_LABEL[claim.verification].label}</span></p>
          <Claim claim={claim} compact />
        </li>;
      })}
    </ol>
    <Gaps graph={ctx.graph} />
  </section>;
}

function DocumentActions({ document, result, label }: { document: GraphDocument; result: AgentResultView | null; label?: string }) {
  const internal = typeof document.attributes.internalHref === "string" ? document.attributes.internalHref : null;
  return <div className="pt-card-actions">
    {internal
      ? <TrackedLink className="ws-button is-small" href={internal} events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>Открыть</TrackedLink>
      : <TrackedLink className="ws-button is-small" href={document.url} external events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>{label ?? "Открыть источник"}<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
    {result && <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />}
  </div>;
}

function RecommendationDelta({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const claims = new Set(entry.claimIds);
  return <Section module={entry}>
    <ol className="pt-versions">
      {entry.documentIds.map(documentId => {
        const document = ctx.index.document.get(documentId);
        if (!document) return null;
        const fresh = freshnessState(ctx.graph, document);
        const docClaims = ctx.graph.claims.filter(claim => claim.documentId === documentId && claims.has(claim.id));
        const kind = document.kind === "society_guideline_summary" ? "Рекомендации общества" : document.kind === "guideline_publication" ? "Публикация рекомендаций" : document.jurisdiction === "RU" ? "Российские рекомендации" : "Рекомендации";
        return <li key={documentId} className="pt-version">
          <div className="ws-result-meta">
            <span className="ws-kind" data-art="guideline">{kind}</span>
            {document.version.label && <span>{document.version.label}</span>}
            {document.version.date && !document.version.label?.includes(document.version.date.slice(0, 4)) && <span>{date(document.version.date)}</span>}
          </div>
          <h3 className="pt-version-title">{nbsp(document.title)}</h3>
          <p className="ws-provenance"><span>{document.publisher ?? sourceName(document)}</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
          {docClaims.map(claim => <Claim key={claim.id} claim={claim} />)}
          <DocumentActions document={document} result={ctx.resultFor(documentId, entry)} />
        </li>;
      })}
    </ol>
  </Section>;
}

function Conflicts({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const ids = Array.isArray(entry.props.conflictIds) ? entry.props.conflictIds : [];
  return <Section module={entry} className="pt-conflicts">
    <p className="ws-muted">{nbsp("Продукт не решает, какой источник прав: сверьте даты, юрисдикцию и статус документов.")}</p>
    {ctx.graph.conflicts.filter(conflict => ids.includes(conflict.id)).map(conflict => <div key={conflict.id} className="pt-conflict">
      <p className="pt-conflict-why">{nbsp(conflict.explanation)}</p>
      <div className="pt-conflict-sides">
        {conflict.claimIds.map(claimId => {
          const claim = ctx.index.claim.get(claimId);
          const document = claim ? ctx.index.document.get(claim.documentId) : undefined;
          if (!claim || !document) return null;
          return <div key={claimId} className="pt-conflict-side">
            <p className="pt-takeaway-source">{nbsp(`${sourceName(document)} · ${document.title}${document.version.date ? ` · ${document.version.date.slice(0, 4)}` : ""}`)}</p>
            <Claim claim={claim} />
          </div>;
        })}
      </div>
    </div>)}
  </Section>;
}

function DrugReference({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  return <>{entry.documentIds.map(documentId => {
    const document = ctx.index.document.get(documentId);
    if (!document) return null;
    const claims = ctx.graph.claims.filter(claim => claim.documentId === documentId && entry.claimIds.includes(claim.id));
    const result = ctx.resultFor(documentId, entry);
    const status = weakestVerification(claims.map(claim => claim.verification));
    const fresh = freshnessState(ctx.graph, document);
    const headingId = `drug-${entry.id}-${documentId.replace(/[^a-z0-9]/giu, "")}`;
    if (document.kind === "inn_listing") {
      return <article key={documentId} className="pt-drug" aria-labelledby={headingId} data-module="drug_reference">
        <h2 className="pt-drug-title" id={headingId}>{nbsp(document.title)}</h2>
        <p className="pt-boundary"><ShieldAlert size={14} aria-hidden="true" />{nbsp("Аналоги содержат одно действующее вещество, но не являются эквивалентной заменой друг другу. Регистрацию проверяйте в ГРЛС.")}</p>
        <ul className="pt-products">{claims.map(claim => <li key={claim.id}>{nbsp(claim.statement)}</li>)}</ul>
        <p className="ws-provenance"><span>МЕДИ РУ</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
        <DocumentActions document={document} result={result} label="Открыть на МЕДИ РУ" />
      </article>;
    }
    const us = document.jurisdiction === "US";
    return <article key={documentId} className="pt-drug" aria-labelledby={headingId} data-module="drug_reference">
      <div className="ws-result-meta">
        <span className="ws-kind" data-art="clinical">{us ? "Инструкция FDA" : "Инструкция по применению"}</span>
        {typeof document.attributes.registration === "string" && <span>рег. № {document.attributes.registration}</span>}
        {document.version.date && <span>{us ? "редакция от " : "обновлено на сайте "}{date(document.version.date)}</span>}
        <span className={`ws-verify ws-verify-${VERIFICATION_LABEL[status].tone}`}>{VERIFICATION_LABEL[status].label}</span>
      </div>
      <h2 className="pt-drug-title" id={headingId}>{nbsp(document.title)}</h2>
      <p className="pt-boundary"><ShieldAlert size={14} aria-hidden="true" />{us
        ? "Это инструкция, утверждённая в США. Показания, дозы и ограничения в России определяет инструкция из ГРЛС; openFDA предупреждает, что данные не валидированы. Решение о назначении — за врачом."
        : nbsp("Копия российской инструкции на сайте МЕДИ РУ (по данным сайта — по ГРЛС). Официальный текст и статус регистрации — в ГРЛС. Решение о назначении — за врачом.")}</p>
      <dl className="pt-drug-sections">
        {claims.map(claim => {
          const chunk = claim.chunkId ? ctx.index.chunk.get(claim.chunkId) : undefined;
          return <div key={claim.id} className="pt-drug-section">
            <dt>{nbsp(chunk?.heading ?? "Раздел инструкции")}</dt>
            <dd lang={claim.language}>{claim.language === "ru" ? nbsp(claim.statement) : claim.statement}</dd>
          </div>;
        })}
      </dl>
      {claims.some(claim => claim.chunkId && ctx.index.chunk.get(claim.chunkId)?.truncated) && <p className="ws-muted">{nbsp("Длинные разделы сокращены — полный текст по ссылке на источник.")}</p>}
      <p className="ws-provenance"><span>{us ? "Инструкция FDA (openFDA, DailyMed)" : "МЕДИ РУ"}</span><StateBadge state={fresh.state} freshness={fresh.label} /></p>
      <div className="pt-card-actions">
        <TrackedLink className="ws-button is-small" href={document.url} external events={["source_opened"]} resultId={result?.id} resultKind={result?.kind}>{us ? "Инструкция на DailyMed" : "Инструкция на МЕДИ РУ"}<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
        <TrackedLink className="ws-button is-small" href="https://grls.rosminzdrav.ru/" external events={["source_opened"]}>Проверить в ГРЛС<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
        {result && <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />}
      </div>
    </article>;
  })}</>;
}

function Evidence({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const claims = new Set(entry.claimIds);
  const mixed = entry.props.language === "mixed";
  return <Section module={entry}>
    {!mixed && <p className="ws-muted">{nbsp("Цитаты разделов «Выводы» из рефератов на языке оригинала. Сначала — наиболее близкие к вопросу.")}</p>}
    <ol className="pt-answers">
      {entry.documentIds.map(documentId => {
        const document = ctx.index.document.get(documentId);
        if (!document) return null;
        const docClaims = ctx.graph.claims.filter(claim => claim.documentId === documentId && claims.has(claim.id));
        const result = ctx.resultFor(documentId, entry);
        return <li key={documentId} className="pt-answer">
          <div className="ws-result-meta">
            <span className="ws-kind" data-art={document.kind === "guideline_publication" || document.kind === "guideline" ? "guideline" : "article"}>{typeof document.attributes.studyType === "string" ? document.attributes.studyType : document.kind === "guideline" ? "Рекомендации" : "Источник"}</span>
            <span>{sourceName(document)}</span>
          </div>
          {docClaims.map(claim => <Claim key={claim.id} claim={claim} />)}
          <p className="pt-answer-source">{typeof document.attributes.conclusionLabel === "string" ? `Раздел «${document.attributes.conclusionLabel}» реферата: ` : ""}<cite>{document.title}</cite></p>
          <DocumentActions document={document} result={result} label={document.sourceId === "pubmed" ? "Открыть в PubMed" : undefined} />
        </li>;
      })}
    </ol>
  </Section>;
}

const STATUS_LABEL: Record<SourceStatus, string> = { LIVE: "Онлайн", LIMITED: "Онлайн", SNAPSHOT: "Снимок редакции", HANDOFF: "Проверка по ссылке", UNAVAILABLE: "Недоступно" };
const OUTCOME_LABEL: Record<SourceOutcome | "not_invoked", string> = { ok: "нашлось", empty: "ничего не нашлось", failed: "не ответил", unavailable: "недоступен", handoff: "не подключён — проверьте сами", blocked: "остановлено", not_invoked: "не понадобился" };

function Sources({ module: entry, ctx }: { module: ManifestModule; ctx: Ctx }) {
  const ids = new Set(Array.isArray(entry.props.sourceIds) ? entry.props.sourceIds : []);
  const rows = ctx.graph.sources.filter(source => ids.has(source.id));
  const unique = rows.filter((row, index) => rows.findIndex(other => other.id === row.id) === index);
  return <details className="ws-trace-disclosure" data-module="sources">
    <summary>{entry.title}</summary>
    <ul className="pt-source-states">
      {unique.map(source => {
        const outcomes = rows.filter(row => row.id === source.id).map(row => row.outcome);
        const outcome = outcomes.includes("ok") ? "ok" : outcomes[0];
        const count = ctx.graph.documents.filter(document => document.sourceId === source.id).length;
        return <li key={source.id}>
          <span>{source.name}</span>
          <span className="ws-mode pt-state" data-state={source.status === "LIMITED" ? "LIVE" : source.status}>{STATUS_LABEL[source.status]}</span>
          <span className="ws-muted">{OUTCOME_LABEL[outcome]}{outcome === "ok" && count ? `: ${count}` : ""}</span>
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
  return <div className="pt-synthesis" data-module="notices">
    {!ctx.graph.documents.length && <p>{nbsp("Подходящих источников не нашлось. Назовите заболевание, препарат (МНН) или тему — например, «метформин при ХБП» или «профилактика мигрени».")}</p>}
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

export function ExperienceView({ run, experience, results }: { run: AgentRun; experience: RunExperience; results: AgentResultView[] }) {
  const index = graphIndex(experience.graph);
  const byKey = new Map(results.map(result => [result.key, result]));
  const ctx: Ctx = {
    run,
    graph: experience.graph,
    index,
    resultFor: (documentId, entry) => {
      const key = entry.resultKeys.find(item => item.endsWith(`mesh:${documentId}`)) ?? `${run.agentId}:mesh:${documentId}`;
      return byKey.get(key) ?? null;
    },
  };
  return <div className="pt-experience" data-mode={experience.manifest.representation.mode} data-density={experience.manifest.representation.density}>
    {run.riskNotices.length > 0 && <ul className="ws-notices">{run.riskNotices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
    {experience.manifest.modules.map(entry => {
      const Renderer = RENDERERS[entry.family];
      return Renderer ? <Renderer key={entry.id} module={entry} ctx={ctx} /> : null;
    })}
  </div>;
}

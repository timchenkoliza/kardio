import { containsDirectiveLanguage } from "@/lib/agents/risk-rules";
import type { EvidenceGraph } from "./evidence";
import { graphIndex } from "./evidence-graph";
import { MODULE_POLICY, STABLE_SHELL_VERSION, type ExperienceManifest, type ModuleFamily } from "./manifest";
import type { SourceDescriptor } from "./sources";

/**
 * Policy validators — executable gates over an ExperienceManifest and the
 * Evidence Graph it points at. They return findings with structured fix
 * suggestions and never mutate anything: a proposed correction becomes a
 * Change (control-plane), not a silent production edit.
 */

export type PolicyName = "DesignSystemPolicy" | "EditorialPolicy" | "EvidencePolicy" | "ExperiencePolicy" | "SourcePolicy";

export interface FixSuggestion {
  kind: "remove_module" | "reorder_modules" | "replace_title" | "remove_claim" | "add_module" | "truncate_excerpt" | "add_disclosure" | "show_currentness";
  detail: Record<string, string | number | string[]>;
  /** Change cause the fix would be filed under. */
  changeCause: "experience_delta" | "policy_delta" | "source_delta" | "code";
}

export interface PolicyFinding {
  policy: PolicyName;
  rule: string;
  severity: "blocking" | "warning";
  target: string;
  message: string;
  fix: FixSuggestion | null;
}

export interface PolicyReport {
  passed: boolean;
  findings: PolicyFinding[];
  blocking: number;
}

export interface PolicyContext {
  descriptors: readonly SourceDescriptor[];
}

const IMPLEMENTATION_VOCABULARY = /(?<![\p{L}])(?:агент\p{L}*|коннектор\p{L}*|connector|agent|llm|нейросет\p{L}*|playwright|api|скрейп\p{L}*|парсер\p{L}*)(?![\p{L}])/iu;
const CONTENT_FAMILIES: ReadonlySet<ModuleFamily> = new Set(["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "event_list", "learning_next_step", "comparison", "timeline", "calculator"]);

function finding(policy: PolicyName, rule: string, severity: PolicyFinding["severity"], target: string, message: string, fix: FixSuggestion | null = null): PolicyFinding {
  return { policy, rule, severity, target, message, fix };
}

export function designSystemPolicy(manifest: ExperienceManifest): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const counts = new Map<ModuleFamily, number>();
  for (const entry of manifest.modules) {
    const policy = MODULE_POLICY[entry.family];
    if (!policy.implemented) out.push(finding("DesignSystemPolicy", "DS-01-approved-family", "blocking", entry.id, `Семейство модулей «${entry.family}» не реализовано утверждёнными компонентами`, { kind: "remove_module", detail: { module: entry.id }, changeCause: "experience_delta" }));
    counts.set(entry.family, (counts.get(entry.family) ?? 0) + 1);
    const approved = policy.title;
    if (entry.title !== approved && !entry.title.startsWith(`${approved}: `)) out.push(finding("DesignSystemPolicy", "DS-05-approved-title", "blocking", entry.id, `Заголовок модуля не из утверждённого набора: «${entry.title}»`, { kind: "replace_title", detail: { module: entry.id, title: approved }, changeCause: "experience_delta" }));
  }
  for (const [family, count] of counts) {
    if (count > MODULE_POLICY[family].maxPerManifest) out.push(finding("DesignSystemPolicy", "DS-02-max-per-family", "blocking", family, `Модулей «${family}» больше допустимого (${count} > ${MODULE_POLICY[family].maxPerManifest})`, { kind: "remove_module", detail: { family }, changeCause: "experience_delta" }));
  }
  if (manifest.modules.length > 10) out.push(finding("DesignSystemPolicy", "DS-03-entry-budget", "warning", manifest.id, `Слишком много модулей на одном экране: ${manifest.modules.length}`));
  return out;
}

export function editorialPolicy(manifest: ExperienceManifest): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const texts: Array<{ target: string; text: string }> = [
    ...manifest.modules.map(entry => ({ target: entry.id, text: entry.title })),
    ...manifest.actions.map(action => ({ target: action.id, text: action.label })),
  ];
  for (const { target, text } of texts) {
    if (IMPLEMENTATION_VOCABULARY.test(text)) out.push(finding("EditorialPolicy", "ED-01-no-implementation-vocabulary", "blocking", target, `Служебная лексика в тексте интерфейса: «${text}»`, { kind: "replace_title", detail: { target }, changeCause: "experience_delta" }));
    if (containsDirectiveLanguage(text)) out.push(finding("EditorialPolicy", "ED-03-no-directive-wording", "blocking", target, `Текст звучит как назначение: «${text}»`, { kind: "replace_title", detail: { target }, changeCause: "experience_delta" }));
    if (text && text[0] !== text[0].toLocaleUpperCase("ru-RU")) out.push(finding("EditorialPolicy", "ED-02-sentence-case", "warning", target, `Подпись начинается со строчной буквы: «${text}»`));
  }
  for (const action of manifest.actions) if (action.label.length > 40) out.push(finding("EditorialPolicy", "ED-02-short-labels", "warning", action.id, `Слишком длинная подпись действия (${action.label.length} знаков)`));
  for (const entry of manifest.modules.filter(item => item.family === "partner")) {
    if (typeof entry.props.disclosure !== "string" || !entry.props.disclosure) out.push(finding("EditorialPolicy", "ED-04-partner-disclosure", "blocking", entry.id, "Партнёрский материал без раскрытия", { kind: "add_disclosure", detail: { module: entry.id }, changeCause: "policy_delta" }));
  }
  return out;
}

export function evidencePolicy(manifest: ExperienceManifest, graph: EvidenceGraph): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const index = graphIndex(graph);
  for (const entry of manifest.modules) {
    const policy = MODULE_POLICY[entry.family];
    for (const claimId of entry.claimIds) {
      const claim = index.claim.get(claimId);
      if (!claim) { out.push(finding("EvidencePolicy", "EV-02-no-invented-claims", "blocking", entry.id, `Модуль ссылается на утверждение, которого нет в графе доказательств: ${claimId}`, { kind: "remove_claim", detail: { module: entry.id, claim: claimId }, changeCause: "code" })); continue; }
      const document = index.document.get(claim.documentId);
      if (!document?.url) out.push(finding("EvidencePolicy", "EV-04-provenance", "blocking", claimId, "У утверждения нет документа-источника со ссылкой", { kind: "remove_claim", detail: { module: entry.id, claim: claimId }, changeCause: "code" }));
      if (claim.verification === "UNSUPPORTED") out.push(finding("EvidencePolicy", "EV-03-no-unsupported-claims", "blocking", claimId, entry.family === "key_takeaway" ? "Неподтверждённое утверждение в главном выводе" : "Неподтверждённое утверждение показано как доказательство", { kind: "remove_claim", detail: { module: entry.id, claim: claimId }, changeCause: "experience_delta" }));
    }
    for (const documentId of entry.documentIds) if (!index.document.has(documentId)) out.push(finding("EvidencePolicy", "EV-02-no-invented-documents", "blocking", entry.id, `Модуль ссылается на документ, которого нет в графе: ${documentId}`, { kind: "remove_module", detail: { module: entry.id }, changeCause: "code" }));
    if (policy.requiresEvidence && !entry.claimIds.length && !entry.documentIds.length) out.push(finding("EvidencePolicy", "EV-01-entry-needs-evidence", "blocking", entry.id, `Модуль «${entry.family}» без доказательств`, { kind: "remove_module", detail: { module: entry.id }, changeCause: "experience_delta" }));
  }
  if (graph.conflicts.length) {
    const shown = new Set(manifest.modules.filter(entry => entry.family === "conflict").flatMap(entry => entry.claimIds));
    const hidden = graph.conflicts.filter(conflict => !conflict.claimIds.every(id => shown.has(id)));
    if (hidden.length) out.push(finding("EvidencePolicy", "EV-05-preserve-conflicts", "blocking", manifest.id, `Расхождение источников не показано: ${hidden.length}`, { kind: "add_module", detail: { family: "conflict", conflicts: hidden.map(conflict => conflict.id) }, changeCause: "experience_delta" }));
  }
  const takeaway = manifest.modules.find(entry => entry.family === "key_takeaway");
  if (takeaway && takeaway.claimIds.length && takeaway.claimIds.every(id => { const method = index.claim.get(id)?.method; return method === "rule_derived" || method === "absence_check"; })) {
    out.push(finding("EvidencePolicy", "EV-06-derived-only-takeaway", "warning", takeaway.id, "Главный вывод состоит только из вычисленных наблюдений"));
  }
  return out;
}

export function experiencePolicy(manifest: ExperienceManifest, graph: EvidenceGraph): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const families = manifest.modules.map(entry => entry.family);
  if (manifest.stableShell !== STABLE_SHELL_VERSION) out.push(finding("ExperiencePolicy", "EX-05-stable-shell", "blocking", manifest.id, "Неизвестная версия оболочки"));
  if (families.includes("key_takeaway") && families[0] !== "key_takeaway") out.push(finding("ExperiencePolicy", "EX-01-takeaway-first", "blocking", manifest.id, "Главный вывод должен открывать результат", { kind: "reorder_modules", detail: { first: "key_takeaway" }, changeCause: "experience_delta" }));
  if (families[0] === "partner") out.push(finding("ExperiencePolicy", "EX-03-partner-not-first", "blocking", manifest.id, "Партнёрский материал не может открывать результат", { kind: "reorder_modules", detail: { notFirst: "partner" }, changeCause: "policy_delta" }));
  if (families.includes("next_actions") && families.at(-1) !== "next_actions") out.push(finding("ExperiencePolicy", "EX-02-next-actions-last", "warning", manifest.id, "«Что дальше» должно завершать результат", { kind: "reorder_modules", detail: { last: "next_actions" }, changeCause: "experience_delta" }));
  const lastContent = Math.max(...families.map((family, index) => (CONTENT_FAMILIES.has(family) ? index : -1)));
  const firstMeta = families.findIndex(family => family === "sources");
  if (firstMeta >= 0 && firstMeta < lastContent) out.push(finding("ExperiencePolicy", "EX-02-sources-after-content", "warning", manifest.id, "Список источников стоит раньше содержательных модулей", { kind: "reorder_modules", detail: { after: "content" }, changeCause: "experience_delta" }));
  if (manifest.intent.job !== graph.job) out.push(finding("ExperiencePolicy", "EX-04-job-drift", "blocking", manifest.id, `Задача манифеста (${manifest.intent.job}) не совпадает с задачей графа (${graph.job})`));
  if (manifest.personalization.applied && !manifest.personalization.signals.length) out.push(finding("ExperiencePolicy", "EX-07-real-signals-only", "blocking", manifest.id, "Персонализация без реальных сигналов"));
  const stale = graph.freshness.filter(item => item.state === "revision_overdue" || item.state === "needs_reverification");
  const shownDocuments = new Set(manifest.modules.flatMap(entry => [...entry.documentIds, ...entry.claimIds.map(id => graph.claims.find(claim => claim.id === id)?.documentId ?? "")]));
  for (const item of stale) {
    if (!shownDocuments.has(item.documentId)) continue;
    const currentness = graph.claims.find(claim => claim.documentId === item.documentId && claim.kind === "currentness");
    const visible = currentness && manifest.modules.some(entry => entry.claimIds.includes(currentness.id));
    if (currentness && !visible) out.push(finding("ExperiencePolicy", "EX-06-currentness-visible", "blocking", item.documentId, "Документ с просроченным пересмотром показан без отметки об актуальности", { kind: "show_currentness", detail: { document: item.documentId, claim: currentness.id }, changeCause: "experience_delta" }));
  }
  for (const entry of manifest.modules.filter(item => item.family === "drug_reference")) {
    const foreign = entry.documentIds.some(id => graph.documents.find(document => document.id === id)?.jurisdiction === "US");
    if (foreign && entry.props.boundary !== true) out.push(finding("ExperiencePolicy", "EX-08-jurisdiction-boundary", "blocking", entry.id, "Инструкция другой страны без указания границы применимости", { kind: "add_disclosure", detail: { module: entry.id }, changeCause: "policy_delta" }));
  }
  return out;
}

export function sourcePolicy(manifest: ExperienceManifest, graph: EvidenceGraph, context: PolicyContext): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const descriptors = new Map(context.descriptors.map(descriptor => [descriptor.id, descriptor]));
  const documents = new Map(graph.documents.map(document => [document.id, document]));
  const shown = new Set(manifest.modules.flatMap(entry => entry.claimIds));
  for (const claim of graph.claims.filter(item => shown.has(item.id))) {
    const document = documents.get(claim.documentId);
    const descriptor = document ? descriptors.get(document.sourceId) : undefined;
    if (!document || !descriptor) continue;
    const limit = descriptor.usagePolicy.maxExcerptChars;
    if (limit && (claim.quote?.length ?? 0) > limit) out.push(finding("SourcePolicy", "SP-03-excerpt-limit", "blocking", claim.id, `Цитата длиннее разрешённого источником (${claim.quote!.length} > ${limit})`, { kind: "truncate_excerpt", detail: { claim: claim.id, max: limit }, changeCause: "source_delta" }));
    if (descriptor.specialties !== "all" && !descriptor.specialties.includes(graph.specialty)) out.push(finding("SourcePolicy", "SP-04-specialty-boundary", "blocking", document.id, `Источник «${descriptor.name}» не предназначен для специальности ${graph.specialty}`, { kind: "remove_claim", detail: { claim: claim.id }, changeCause: "source_delta" }));
    if (descriptor.usagePolicy.attributionRequired && (!document.url || !document.publisher)) out.push(finding("SourcePolicy", "SP-05-attribution", "blocking", document.id, "Документ без атрибуции (ссылка и издатель обязательны)"));
  }
  const failed = new Set(graph.sources.filter(source => source.outcome === "failed" || source.outcome === "unavailable").map(source => source.id));
  for (const document of graph.documents) if (failed.has(document.sourceId) && !graph.sources.some(source => source.id === document.sourceId && source.outcome === "ok")) out.push(finding("SourcePolicy", "SP-02-no-results-from-failed-source", "blocking", document.id, "Документ из источника, который завершился ошибкой"));
  const listed = new Set(manifest.modules.filter(entry => entry.family === "sources").flatMap(entry => Array.isArray(entry.props.sourceIds) ? entry.props.sourceIds : []));
  for (const source of graph.sources) if (source.outcome !== "not_invoked" && !listed.has(source.id)) out.push(finding("SourcePolicy", "SP-01-show-sources-used", "blocking", source.id, `Использованный источник не показан в списке источников: ${source.name}`, { kind: "add_module", detail: { family: "sources", source: source.id }, changeCause: "experience_delta" }));
  return out;
}

export function validateManifest(manifest: ExperienceManifest, graph: EvidenceGraph, context: PolicyContext): PolicyReport {
  const findings = [
    ...designSystemPolicy(manifest),
    ...editorialPolicy(manifest),
    ...evidencePolicy(manifest, graph),
    ...experiencePolicy(manifest, graph),
    ...sourcePolicy(manifest, graph, context),
  ];
  const blocking = findings.filter(item => item.severity === "blocking").length;
  return { passed: blocking === 0, findings, blocking };
}

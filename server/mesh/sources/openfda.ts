import { nosologyById } from "@/lib/mesh/domain-graph";
import type { NormalizedClaim, NormalizedDocument, SourceResult } from "@/lib/mesh/evidence";
import type { SourceDescriptor, SourceStatusReport } from "@/lib/mesh/sources";
import type { DrugLabel } from "@/server/agents/adapters/openfda";
import { combineFingerprints } from "../fingerprint";
import { coverageOf, drugEntity, emptyResult, invocation, makeChunk, makeClaim, polarityOf, verifyQuote } from "./common";
import type { SourceAdapter, SourceRequest } from "./types";

/**
 * openFDA drug labels: the current US label, verbatim. Official, but for
 * another jurisdiction — every result carries the US-vs-Russia boundary and
 * is used only when the Russian instruction is not available or the job asks
 * for it.
 */

export const OPENFDA_DESCRIPTOR: SourceDescriptor = {
  id: "openfda",
  name: "Инструкции FDA (openFDA)",
  connectorId: "openfda-labels",
  domains: ["drug"],
  specialties: "all",
  jobs: ["drug_reference", "drug_comparison", "reference_answer", "guideline_check", "source_positions"],
  provides: ["drug_label"],
  operations: ["drug_label"],
  authority: "official",
  execution: "api",
  freshnessPolicy: { kind: "live", reverifyAfterHours: 24, note: "Запрос во время ответа; кэш 6 часов" },
  cachePolicy: { scope: "process", ttlSeconds: 6 * 3600 },
  usagePolicy: { robots: null, terms: { url: "https://open.fda.gov/terms/", checkedAt: "2026-10-21", summary: "Открытые данные; openFDA предупреждает, что данные не валидированы для клинических решений; 1000 запросов в день без ключа" }, audience: "public", reuse: "full_text", maxExcerptChars: 900, attributionRequired: true, rateLimitPerMinute: 240, agreement: "not_required", jurisdiction: "US", openQuestions: ["Ключ OPENFDA_API_KEY для квоты 120 000 запросов в день"] },
  cost: 1,
  handoffUrl: "https://dailymed.nlm.nih.gov/",
};

const KIND: Record<string, NormalizedClaim["kind"]> = {
  indications_and_usage: "indication",
  contraindications: "contraindication",
  boxed_warning: "warning",
  warnings_and_cautions: "warning",
  dosage_and_administration: "dosing",
  pregnancy: "warning",
  pediatric_use: "warning",
};

export function labelDocument(label: DrugLabel, args: { inn: string; ru: string; retrievedAt: string; nosologyId: string | null; sections: ReadonlySet<string> }): NormalizedDocument {
  const id = `openfda:${label.setId}`;
  const drug = drugEntity(args.inn, args.ru);
  // A combination product's doses are not the drug's: its dosing section is never taken.
  const sections = label.sections.filter(section => args.sections.has(section.id) && !(label.combination && section.id === "dosage_and_administration")).slice(0, 7);
  const chunks = sections.map(section => makeChunk({ documentId: id, path: [section.ru], fullText: section.text, maxChars: 900, keepText: true, entityIds: [drug.id] }));
  const claims = sections.map((section, index) => {
    const check = verifyQuote({ connectorId: "openfda-labels", url: label.dailyMedUrl, sourceName: `Инструкция FDA · ${section.ru}`, statement: section.text, quote: section.text, language: "en", level: "regulatory", secondary: false, verifyIn: null, retrievedAt: args.retrievedAt, publishedAt: label.effectiveDate });
    return makeClaim({ documentId: id, chunkId: chunks[index].id, kind: KIND[section.id] ?? "label_section", statement: section.text, quote: section.text, language: "en", polarity: polarityOf(section.text), entityIds: [drug.id], covers: args.nosologyId ? coverageOf(section.text, args.nosologyId) : [], method: "verbatim", confidence: 1, verification: check.verification, verificationNote: check.note });
  });
  return {
    id, sourceId: "openfda", kind: "drug_label", title: `${args.ru[0].toLocaleUpperCase("ru-RU")}${args.ru.slice(1)}${label.combination ? " в составе комбинированного препарата" : ""} (${label.genericName || args.inn}): инструкция FDA`, url: label.dailyMedUrl, language: "en",
    publisher: label.manufacturer ?? "U.S. Food and Drug Administration", publishedAt: label.effectiveDate, retrievedAt: args.retrievedAt,
    version: { fingerprint: combineFingerprints(chunks.map(chunk => chunk.fingerprint)), label: label.version ? `версия ${label.version}` : null, date: label.effectiveDate },
    jurisdiction: "US", authority: "official", state: "LIVE",
    attributes: { inn: args.inn, genericName: label.genericName || args.inn, brands: label.brandNames.join(", ") || null, setId: label.setId, productType: label.productType, sectionTitles: sections.map(section => section.ru).join("|"), combination: label.combination ?? false, truncated: sections.some(section => section.truncated) },
    chunks, claims, entities: [drug],
  };
}

export function createOpenfdaAdapter(): SourceAdapter {
  async function status(): Promise<SourceStatusReport> {
    return process.env.OPENFDA_DISABLED === "1" ? { status: "UNAVAILABLE", reason: "openFDA отключён в окружении", execution: "api" } : { status: "LIVE", reason: "openFDA API", execution: "api" };
  }

  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const report = await status();
    if (report.status === "UNAVAILABLE") return emptyResult(request, { sourceId: "openfda", outcome: "unavailable", status: "UNAVAILABLE", execution: "api", started, note: report.reason });
    const drug = request.intent.entities.drugs[0];
    if (!drug) return emptyResult(request, { sourceId: "openfda", outcome: "empty", status: report.status, execution: "api", started, note: "Препарат в запросе не распознан" });
    if (request.intent.job.primary === "drug_comparison" && request.intent.entities.drugs.length > 1) return compareLabels(request, started, report);
    const result = await request.ctx.drugLabel(drug.inn);
    if (result.status !== "ok" || !result.label) {
      return emptyResult(request, { sourceId: "openfda", outcome: result.status === "not_found" ? "empty" : result.status === "unavailable" ? "unavailable" : "failed", status: report.status, execution: "api", started, errorCode: result.status === "ok" ? null : result.status, note: result.status === "not_found" ? `В базе FDA нет инструкции для «${drug.ru}»` : result.error });
    }
    const wanted = new Set(["boxed_warning", "recent_major_changes", "indications_and_usage", "contraindications", "warnings_and_cautions"]);
    if (request.intent.job.primary === "drug_reference") { wanted.add("dosage_and_administration"); wanted.add("drug_interactions"); }
    if (request.intent.safety.includes("pregnancy_sections")) wanted.add("pregnancy");
    if (request.intent.safety.includes("pediatric_sections")) wanted.add("pediatric_use");
    const document = labelDocument(result.label, { inn: drug.inn, ru: drug.ru, retrievedAt: result.retrievedAt, nosologyId: nosologyById(request.intent.context.nosology?.id)?.id ?? null, sections: wanted });
    return { invocation: invocation(request, { sourceId: "openfda", outcome: "ok", status: report.status, execution: "api", started, documentIds: [document.id], urls: [result.label.apiUrl] }), documents: [document] };
  }

  /** US labels of every compared drug, read in parallel; a label FDA does not have is named, not invented. */
  async function compareLabels(request: SourceRequest, started: number, report: SourceStatusReport): Promise<SourceResult> {
    const drugs = request.intent.entities.drugs.slice(0, 4);
    const wanted = new Set(["boxed_warning", "indications_and_usage", "contraindications", "warnings_and_cautions", "dosage_and_administration", "drug_interactions", "pregnancy", "pediatric_use"]);
    const labels = await Promise.all(drugs.map(async drug => ({ drug, result: await request.ctx.drugLabel(drug.inn) })));
    const documents = labels.filter(item => item.result.status === "ok" && item.result.label).map(item => labelDocument(item.result.label!, { inn: item.drug.inn, ru: item.drug.ru, retrievedAt: item.result.retrievedAt, nosologyId: nosologyById(request.intent.context.nosology?.id)?.id ?? null, sections: wanted }));
    const missing = labels.filter(item => item.result.status !== "ok" || !item.result.label).map(item => item.drug.ru);
    const failed = labels.every(item => item.result.status === "failed" || item.result.status === "unavailable");
    return {
      invocation: invocation(request, { sourceId: "openfda", outcome: documents.length ? "ok" : failed ? "failed" : "empty", status: report.status, execution: "api", started, note: missing.length ? `В базе FDA нет инструкций: ${missing.join(", ")}` : null, documentIds: documents.map(document => document.id), urls: labels.filter(item => item.result.label).map(item => item.result.label!.apiUrl) }),
      documents,
    };
  }

  return { ...OPENFDA_DESCRIPTOR, status, execute };
}

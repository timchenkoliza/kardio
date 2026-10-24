import { weakestVerification } from "@/lib/agents/format";
import { assessSource, type SourceAssessment } from "./source-policy";
import { lexicalSupport } from "@/lib/agents/text";
import type { Evidence, VerificationStatus } from "@/lib/agents/types";
import type { QuoteEvidence } from "./evidence";

/**
 * FactCheckService — a mandatory gate, not a user-facing agent.
 *
 * It checks a claim against the evidence it is attached to:
 *   1. provenance completeness (source URL or support text);
 *   2. numeric consistency (every number in the claim appears in the support);
 *   3. lexical support when claim and support share a language;
 *   4. source standing modifiers (secondary source, currentness, derived cards,
 *      missing dates) that can only lower the status.
 * It never upgrades an unsupported inference into a sourced fact.
 */

function numbers(value: string): string[] {
  const normalized = value.replace(/(\d)\s+(?=\d{3}\b)/g, "$1").replace(/(\d),(\d)/g, "$1.$2");
  return [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0].replace(/^0+(?=\d)/, ""));
}

function dominantScript(value: string): "cyrillic" | "latin" | "none" {
  const cyrillic = (value.match(/[А-Яа-яЁё]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  if (!cyrillic && !latin) return "none";
  return cyrillic >= latin ? "cyrillic" : "latin";
}

function isQuoteEvidence(evidence: Evidence): evidence is QuoteEvidence {
  return "quoteKind" in evidence && "quoteLanguage" in evidence;
}

export interface FactCheckContext {
  /** Catalog currentness of the underlying object, when known. */
  currentness?: "current" | "review" | "superseded" | "archived" | null;
  editorialStatus?: string | null;
  connectorAvailable?: boolean;
  dateUncertain?: boolean;
  unverifiedDraft?: boolean;
}

export function numericConsistency(claim: string, support: string): boolean {
  const claimNumbers = numbers(claim);
  if (!claimNumbers.length) return true;
  const supportNumbers = new Set(numbers(support));
  return claimNumbers.every(value => supportNumbers.has(value));
}

/** Physician standing of the evidence source; user content is the user's own and is not assessed. */
export function sourceAssessmentFor(evidence: Pick<Evidence, "sourceUrl" | "provenance">): SourceAssessment | null {
  if (evidence.provenance.ownership === "USER_UPLOADED" || evidence.provenance.ownership === "GENERATED") return null;
  return assessSource({ url: evidence.sourceUrl ?? evidence.provenance.sourceUrl, journal: evidence.provenance.journal });
}

function standingNote(source: SourceAssessment): string | null {
  if (source.standing === "approved") return source.brand;
  if (source.standing === "conditional") return source.condition ? `${source.brand}: ${source.condition}` : source.brand;
  if (source.standing === "reviewed_not_whitelisted" || source.standing === "rejected") return [source.brand, source.note].filter(Boolean).join(" — ");
  return null;
}

export function factCheck(evidence: Evidence, context: FactCheckContext = {}): Evidence {
  const source = sourceAssessmentFor(evidence);
  if (source) evidence = { ...evidence, provenance: { ...evidence.provenance, standing: source.standing, standingNote: standingNote(source) } };
  const notes: string[] = [];
  let status: VerificationStatus;
  let confidence = evidence.confidence;

  if (source?.standing === "rejected") {
    return { ...evidence, verificationStatus: "UNSUPPORTED", confidence: 0, verificationNote: `Источник отклонён врачами при валидации источников${source.brand ? ` (${source.brand})` : ""} — не используется как доказательство` };
  }

  if (context.connectorAvailable === false) {
    return { ...evidence, verificationStatus: "UNKNOWN", confidence: 0, verificationNote: evidence.verificationNote ?? "Источник недоступен во время проверки" };
  }
  if (context.unverifiedDraft) {
    return { ...evidence, verificationStatus: "UNSUPPORTED", confidence: 0, verificationNote: "Редакционный черновик без проверки источника — не используется как доказательство" };
  }
  if (!evidence.supportText || (!evidence.sourceUrl && evidence.provenance.ownership !== "USER_UPLOADED")) {
    return { ...evidence, verificationStatus: "UNSUPPORTED", confidence: 0, verificationNote: "У утверждения нет проверяемого источника" };
  }
  if (!numericConsistency(evidence.claim, evidence.supportText)) {
    return { ...evidence, verificationStatus: "UNSUPPORTED", confidence: 0, verificationNote: "Числа в утверждении не совпадают с источником" };
  }

  const sameLanguage = dominantScript(evidence.claim) === dominantScript(evidence.supportText);
  if (sameLanguage) {
    const score = lexicalSupport(evidence.claim, evidence.supportText);
    confidence = Math.round(Math.min(confidence, Math.max(score, 0)) * 100) / 100;
    if (score >= 0.6) status = "SUPPORTED";
    else if (score >= 0.3) { status = "PARTIALLY_SUPPORTED"; notes.push("Утверждение совпадает с источником не полностью"); }
    else return { ...evidence, verificationStatus: "UNSUPPORTED", confidence, verificationNote: "Источник не содержит этого утверждения" };
  } else if (isQuoteEvidence(evidence)) {
    status = "SUPPORTED";
    notes.push(evidence.quoteKind === "verbatim" ? "Перевод дословной цитаты источника" : "Перевод фрагмента страницы источника");
  } else {
    status = "PARTIALLY_SUPPORTED";
    notes.push("Утверждение и источник на разных языках — сверка по числам и названиям");
  }

  if (isQuoteEvidence(evidence) && evidence.secondary) {
    status = weakestVerification([status, "PARTIALLY_SUPPORTED"]);
    notes.push(evidence.verifyIn ? `Вторичный источник; сверьте в первоисточнике: ${evidence.verifyIn}` : "Вторичный источник");
  }
  if (context.currentness === "review") { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push("Актуальность версии требует проверки"); }
  if (context.currentness === "superseded") { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push("Есть более новая версия документа"); }
  if (context.currentness === "archived") { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push("Архивный материал"); }
  if (context.editorialStatus === "derived_from_source") { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push("Карточка составлена по документу — сверьте с полным текстом"); }
  if (context.dateUncertain) { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push("Дата указана не полностью"); }
  if (source?.standing === "reviewed_not_whitelisted") { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push(`Не в белом списке врачей: ${standingNote(source) ?? "источник"}`); }
  // A journal the physicians did not assess (NEJM, Eur Heart J) is outside their list too — said as «не оценивался»,
  // never with the standing of the catalogue (PubMed) it was found in (R1 C-7).
  if (source?.standing === "unreviewed" && evidence.provenance.journal?.trim()) { status = weakestVerification([status, "PARTIALLY_SUPPORTED"]); notes.push(`Не в белом списке врачей: журнал ${evidence.provenance.journal} врачи не оценивали`); }
  if (source?.standing === "conditional" && source.condition) notes.push(`Врачи одобрили с условием: ${source.condition}`);

  return { ...evidence, verificationStatus: status, confidence, verificationNote: notes.length ? notes.join(". ") : null };
}

export function resultVerification(evidence: readonly Evidence[]): VerificationStatus {
  return weakestVerification(evidence.map(item => item.verificationStatus));
}

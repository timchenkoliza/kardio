import type { NormalizedIntent } from "./intent";
import { REQUIREMENT_LABEL, type EvidenceRequirement } from "./jobs";
import { servesSpecialty, type SourceAuthority, type SourceDescriptor, type SourceId, type SourceOperation, type SourceStatusReport } from "./sources";

/**
 * SourcePlanner: NormalizedIntent → ExecutionPlan.
 *
 * For each evidence requirement it picks the fewest sources that can meet
 * it: one primary, at most one fallback that runs only if the primary comes
 * back empty or fails, and official hand-offs that are never executed.
 * Sources are excluded for a stated reason (specialty, status, physician's
 * exclusions, missing entities, redundancy). Every source is never called
 * for every query.
 */

export interface ExecutionStep {
  id: string;
  requirement: EvidenceRequirement;
  sourceId: SourceId;
  operation: SourceOperation;
  role: "primary" | "fallback" | "handoff";
  /** Fallbacks run only when the referenced step produced no documents. */
  runIf: { previousEmpty: string } | null;
  reason: string;
  /** Other requirements the same invocation already serves (no second call). */
  alsoCovers: EvidenceRequirement[];
}

export interface ExecutionPlan {
  id: string;
  intentId: string;
  steps: ExecutionStep[];
  rejected: Array<{ sourceId: SourceId; requirement: EvidenceRequirement | null; reason: string }>;
  /** Requirements no available source can meet, with the physician-language reason. */
  unmet: Array<{ requirement: EvidenceRequirement; reason: string }>;
  budget: { maxInvocations: number; planned: number };
}

const REQUIREMENT_OPERATIONS: Record<EvidenceRequirement, SourceOperation[]> = {
  russian_drug_reference: ["drug_reference"],
  drug_label: ["drug_label"],
  drug_safety_signal: ["safety_signals"],
  product_listing: ["inn_lookup"],
  russian_guideline: ["guideline_discovery", "disease_reference"],
  official_guideline_status: ["handoff"],
  official_drug_registration: ["handoff"],
  international_guideline: ["literature_search", "society_guideline"],
  specialty_society_guideline: ["society_guideline"],
  current_research: ["literature_search"],
  professional_article: ["professional_article_search"],
  event_listing: [],
  learning_material: [],
  user_material: [],
};

/** When a requirement's sources all fail, a weaker requirement may stand in (with its own boundary). */
const STAND_IN: Partial<Record<EvidenceRequirement, EvidenceRequirement>> = {
  russian_drug_reference: "drug_label",
};

const AUTHORITY_RANK: Record<SourceAuthority, number> = { official: 0, primary: 1, professional: 2, secondary: 3 };
const MAX_INVOCATIONS = 6;

function precondition(requirement: EvidenceRequirement, intent: NormalizedIntent): string | null {
  const drug = intent.entities.drugs.length > 0;
  const nosology = Boolean(intent.context.nosology);
  switch (requirement) {
    case "russian_drug_reference":
    case "drug_label":
    case "drug_safety_signal":
    case "product_listing":
    case "official_drug_registration":
      return drug ? null : "препарат в вопросе не распознан";
    case "russian_guideline":
    case "specialty_society_guideline":
    case "official_guideline_status":
      return nosology ? null : "заболевание в вопросе не распознано";
    case "current_research":
    case "international_guideline":
      return intent.entities.concepts.length || intent.entities.latin.length || nosology ? null : "в вопросе нет распознанных терминов";
    default:
      return null;
  }
}

function operationFor(source: SourceDescriptor, requirement: EvidenceRequirement, intent: NormalizedIntent): SourceOperation | null {
  const allowed = REQUIREMENT_OPERATIONS[requirement].filter(operation => source.operations.includes(operation));
  if (requirement === "russian_guideline" && intent.job.primary === "disease_reference" && allowed.includes("disease_reference")) return "disease_reference";
  return allowed[0] ?? null;
}

export function planSources(args: {
  intent: NormalizedIntent;
  sources: readonly SourceDescriptor[];
  statuses: Partial<Record<SourceId, SourceStatusReport>>;
  excludedConnectors?: readonly string[];
  planId?: string;
}): ExecutionPlan {
  const { intent } = args;
  const steps: ExecutionStep[] = [];
  const rejected: ExecutionPlan["rejected"] = [];
  const unmet: ExecutionPlan["unmet"] = [];
  const excluded = new Set(args.excludedConnectors ?? []);
  let counter = 0;
  const nextId = () => `step-${++counter}`;
  const invocations = () => steps.filter(step => step.role !== "handoff").length;

  const candidatesFor = (requirement: EvidenceRequirement) => {
    const pool: Array<{ source: SourceDescriptor; operation: SourceOperation }> = [];
    for (const source of args.sources) {
      if (!source.provides.includes(requirement)) continue;
      const operation = operationFor(source, requirement, intent);
      if (!operation) continue;
      if (!servesSpecialty(source, intent.context.specialty)) { rejected.push({ sourceId: source.id, requirement, reason: "источник не для этой специальности" }); continue; }
      if (!source.jobs.includes(intent.job.primary)) { rejected.push({ sourceId: source.id, requirement, reason: "источник не подходит для этой задачи" }); continue; }
      if (excluded.has(source.connectorId) || excluded.has(source.id)) { rejected.push({ sourceId: source.id, requirement, reason: "исключён в ваших источниках" }); continue; }
      const status = args.statuses[source.id]?.status;
      if (status === "UNAVAILABLE") { rejected.push({ sourceId: source.id, requirement, reason: args.statuses[source.id]?.reason ?? "источник недоступен" }); continue; }
      pool.push({ source, operation });
    }
    return pool.sort((a, b) => Number(a.source.execution === "manual-handoff") - Number(b.source.execution === "manual-handoff")
      || AUTHORITY_RANK[a.source.authority] - AUTHORITY_RANK[b.source.authority]
      || a.source.cost - b.source.cost
      || a.source.id.localeCompare(b.source.id));
  };

  const plan = (requirement: EvidenceRequirement, required: boolean): void => {
    const blocked = precondition(requirement, intent);
    if (blocked) { if (required) unmet.push({ requirement, reason: blocked }); return; }
    // One literature search already covers guideline publications.
    if (requirement === "international_guideline" && steps.some(step => step.sourceId === "pubmed" && step.requirement === "current_research")) {
      const society = candidatesFor(requirement).find(item => item.operation === "society_guideline");
      if (!society) { rejected.push({ sourceId: "pubmed", requirement, reason: "уже покрыто поиском свежих обзоров и рекомендаций" }); return; }
    }
    const candidates = candidatesFor(requirement).filter(item => !(requirement === "international_guideline" && item.source.id === "pubmed" && steps.some(step => step.sourceId === "pubmed")));
    const executable = candidates.filter(item => item.source.execution !== "manual-handoff");
    const handoffs = candidates.filter(item => item.source.execution === "manual-handoff");
    if (!executable.length && required && STAND_IN[requirement]) {
      // The intended source is unavailable: the weaker stand-in becomes the primary, and the gap is still reported.
      unmet.push({ requirement, reason: `источник недоступен — вместо него: ${REQUIREMENT_LABEL[STAND_IN[requirement]!]}` });
      plan(STAND_IN[requirement]!, true);
      return;
    }
    if (!executable.length && !handoffs.length) {
      if (required) unmet.push({ requirement, reason: `нет подключённого источника: ${REQUIREMENT_LABEL[requirement]}` });
      return;
    }
    // Optional evidence is added only when it is cheap, or is an official hand-off.
    if (!required && executable[0] && executable[0].source.cost > 1 && !handoffs.length) {
      rejected.push({ sourceId: executable[0].source.id, requirement, reason: "необязательно для этой задачи и дорого по времени" });
      return;
    }
    const same = executable[0] && steps.find(step => step.sourceId === executable[0].source.id && step.operation === executable[0].operation);
    if (same) {
      same.alsoCovers.push(requirement);
      rejected.push({ sourceId: executable[0].source.id, requirement, reason: "уже вызывается для другой потребности — повторного обращения нет" });
      return;
    }
    let primaryId: string | null = null;
    if (executable[0] && (required || executable[0].source.cost <= 1)) {
      if (invocations() >= MAX_INVOCATIONS) { rejected.push({ sourceId: executable[0].source.id, requirement, reason: "превышен бюджет обращений к источникам" }); }
      else {
        primaryId = nextId();
        steps.push({ id: primaryId, requirement, sourceId: executable[0].source.id, operation: executable[0].operation, role: "primary", runIf: null, reason: `${REQUIREMENT_LABEL[requirement]}: ${executable[0].source.name}`, alsoCovers: [] });
        const fallback = executable[1];
        if (fallback && invocations() < MAX_INVOCATIONS && (required || fallback.source.cost <= 1)) {
          steps.push({ id: nextId(), requirement, sourceId: fallback.source.id, operation: fallback.operation, role: "fallback", runIf: { previousEmpty: primaryId }, reason: `если «${executable[0].source.name}» ничего не даст`, alsoCovers: [] });
        }
        for (const extra of executable.slice(2)) rejected.push({ sourceId: extra.source.id, requirement, reason: "достаточно основного и запасного источника" });
        const standIn = STAND_IN[requirement];
        if (standIn && required) {
          const stand = candidatesFor(standIn).find(item => item.source.execution !== "manual-handoff");
          if (stand && !steps.some(step => step.sourceId === stand.source.id)) {
            const lastOfChain = steps.filter(step => step.requirement === requirement && step.role !== "handoff").at(-1)!.id;
            steps.push({ id: nextId(), requirement: standIn, sourceId: stand.source.id, operation: stand.operation, role: "fallback", runIf: { previousEmpty: lastOfChain }, reason: `если российской инструкции не будет: ${REQUIREMENT_LABEL[standIn]} (другая юрисдикция)`, alsoCovers: [] });
          }
        }
      }
    }
    for (const handoff of handoffs.slice(0, 1)) {
      if (steps.some(step => step.sourceId === handoff.source.id)) continue;
      steps.push({ id: nextId(), requirement, sourceId: handoff.source.id, operation: handoff.operation, role: "handoff", runIf: null, reason: `официальный статус проверяется по ссылке: ${handoff.source.name}`, alsoCovers: [] });
    }
    if (!primaryId && !handoffs.length && required) unmet.push({ requirement, reason: `нет подключённого источника: ${REQUIREMENT_LABEL[requirement]}` });
  };

  for (const requirement of intent.requirements) plan(requirement, true);
  for (const requirement of intent.optional) plan(requirement, false);

  const used = new Set(steps.map(step => step.sourceId));
  for (const source of args.sources) {
    if (!used.has(source.id) && !rejected.some(item => item.sourceId === source.id)) rejected.push({ sourceId: source.id, requirement: null, reason: "не нужен для этой задачи" });
  }

  return {
    id: args.planId ?? `plan-${intent.id}`,
    intentId: intent.id,
    steps,
    rejected,
    unmet,
    budget: { maxInvocations: MAX_INVOCATIONS, planned: invocations() },
  };
}

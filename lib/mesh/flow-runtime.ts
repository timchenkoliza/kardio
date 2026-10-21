import type { ClaimKind, EvidenceGraph, GraphDocument } from "./evidence";
import { REQUIREMENT_LABEL } from "./jobs";
import type { ModuleFamily } from "./manifest";
import { topologicalSteps } from "./flows/registry";
import type { FlowCondition, FlowStep, IntentFlow, IntentSkill } from "./skills/types";

/**
 * Flow runtime: walks a Skill's IntentFlow over the evidence the plan
 * gathered, in dependency order. Retrieval steps are served by the ONE
 * source plan (the planner still chooses sources); branch steps test
 * deterministic conditions over the graph; derive steps turn the branch
 * taken into bounded experience directives — props on approved modules,
 * explicit gaps, claim priority. Nothing here writes medical text: every
 * string is fixed interface copy or a value the source stated.
 */

export type FlowStepStatus = "done" | "skipped" | "not_taken";

export interface FlowStepTrace {
  id: string;
  kind: FlowStep["kind"];
  label: string;
  status: FlowStepStatus;
  /** For branch steps: which way the evidence sent the flow. */
  branch?: "then" | "otherwise";
}

export interface FlowTrace {
  flowId: string;
  version: string;
  steps: FlowStepTrace[];
  /** e.g. `has_previous:then` — the evidence path this run took. */
  branches: string[];
}

type Scalar = string | number | boolean | null | string[];

export interface FlowDirectives {
  /** Explicit, physician-language gaps added by a branch (e.g. no official Russian guideline). */
  gaps: string[];
  /** Props merged into approved modules. */
  moduleProps: Partial<Record<ModuleFamily, Record<string, Scalar>>>;
  /** Claims shown first in the key takeaway (when relevant). */
  priorityClaims: string[];
  /** Key-takeaway priority of the Skill's experience policy for this family. */
  takeaway: ReadonlyArray<readonly [ClaimKind, number]> | null;
}

export interface FlowRun {
  trace: FlowTrace;
  directives: FlowDirectives;
}

const GUIDELINE_KINDS = new Set<GraphDocument["kind"]>(["guideline", "society_guideline_summary", "guideline_publication"]);

function dateOf(document: GraphDocument): string {
  return document.version.date ?? document.publishedAt ?? "";
}

function previousVersionOf(graph: EvidenceGraph): { document: GraphDocument; label: string } | null {
  const candidates = graph.documents
    .filter(document => GUIDELINE_KINDS.has(document.kind))
    // A stated previous version (society summaries), or a catalogue edition this document supersedes.
    .map(document => ({ document, label: typeof document.attributes.previousVersion === "string" && document.attributes.previousVersion ? document.attributes.previousVersion : typeof document.attributes.supersedes === "string" && document.attributes.supersedes ? "предыдущая редакция в каталоге" : null }))
    .filter((item): item is { document: GraphDocument; label: string } => Boolean(item.label))
    .sort((a, b) => dateOf(b.document).localeCompare(dateOf(a.document)));
  return candidates[0] ?? null;
}

const CHILDREN_SECTION = /у детей|детям|детск|pediatric/iu;
const CHILDREN_MENTION = /(?<![\p{L}])(?:дет(?:и|ям|ей|ский|ского|ском)|ребен\p{L}*|подрост\p{L}*|новорожденн\p{L}*|младенц\p{L}*|children|pediatric)/iu;

/** What the instruction says about children: its own section, then dosing text that names children. */
function pediatricClaims(graph: EvidenceGraph): string[] {
  const chunks = new Map(graph.chunks.map(chunk => [chunk.id, chunk]));
  const labels = new Set(graph.documents.filter(document => document.kind === "drug_instruction" || document.kind === "drug_label").map(document => document.id));
  const usable = graph.claims.filter(claim => labels.has(claim.documentId) && claim.verification !== "UNSUPPORTED");
  const section = usable.filter(claim => claim.chunkId && CHILDREN_SECTION.test(chunks.get(claim.chunkId)?.heading ?? ""));
  const dosing = usable.filter(claim => claim.kind === "dosing" && !section.includes(claim) && CHILDREN_MENTION.test(claim.statement));
  // Russian instruction first, then other jurisdictions (shown with their boundary).
  const ru = (id: string) => Number(graph.documents.find(document => document.id === id)?.jurisdiction !== "RU");
  return [...section, ...dosing].sort((a, b) => ru(a.documentId) - ru(b.documentId)).map(claim => claim.id);
}

export function evaluateCondition(condition: FlowCondition, graph: EvidenceGraph): boolean {
  switch (condition) {
    case "official_ru_guideline_available":
      return graph.documents.some(document => document.kind === "guideline" && document.jurisdiction === "RU");
    case "previous_version_found":
      return Boolean(previousVersionOf(graph));
    case "russian_instruction_found":
      return graph.documents.some(document => document.kind === "drug_instruction" && document.jurisdiction === "RU");
    case "pediatric_section_found":
      return pediatricClaims(graph).length > 0;
    case "guideline_found":
      return graph.documents.some(document => GUIDELINE_KINDS.has(document.kind));
  }
}

function derive(operation: string, graph: EvidenceGraph, directives: FlowDirectives): void {
  const delta = (directives.moduleProps.recommendation_delta ??= {});
  switch (operation) {
    case "official_gap": {
      const label = REQUIREMENT_LABEL.russian_guideline;
      if (!graph.gaps.some(gap => gap.startsWith(label))) directives.gaps.push(`${label} по теме не найдены — официальный статус проверьте в рубрикаторе Минздрава`);
      return;
    }
    case "current_version": {
      const current = graph.documents.filter(document => GUIDELINE_KINDS.has(document.kind)).sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
      if (current) delta.currentDocumentId = current.id;
      return;
    }
    case "version_delta": {
      const previous = previousVersionOf(graph);
      if (!previous) return;
      delta.comparison = "previous_version";
      delta.previousVersion = previous.label;
      delta.changedDocumentId = previous.document.id;
      return;
    }
    case "current_state":
      delta.comparison = "current_state";
      return;
    case "affected_claims": {
      const previous = previousVersionOf(graph);
      if (!previous) return;
      delta.changedClaimIds = graph.claims.filter(claim => claim.documentId === previous.document.id && claim.kind === "society_assertion" && claim.verification !== "UNSUPPORTED").map(claim => claim.id);
      return;
    }
    case "instruction_gap": {
      const label = REQUIREMENT_LABEL.russian_drug_reference;
      if (!graph.gaps.some(gap => gap.startsWith(label))) directives.gaps.push(`${label} не найдена — показана инструкция другой юрисдикции, если она есть`);
      return;
    }
    case "pediatric_first":
      directives.priorityClaims.push(...pediatricClaims(graph));
      (directives.moduleProps.drug_reference ??= {}).pediatricSection = true;
      return;
    case "pediatric_gap": {
      if (graph.documents.some(document => document.kind === "drug_instruction" || document.kind === "drug_label")) directives.gaps.push("в выдержках инструкции нет отдельных сведений о детях — дозирование и возрастные ограничения для детей проверьте в полной инструкции");
      (directives.moduleProps.drug_reference ??= {}).pediatricSection = false;
      return;
    }
    default:
      // indication_match, guideline_position, conflicts_currentness: performed by the evidence graph and the compiler.
      return;
  }
}

/**
 * Walk the flow over a (complete) evidence graph. Steps on the branch not
 * taken are recorded as `not_taken`; a retrieve step whose requirements had
 * no planned source is `skipped` — the trace is the honest record of the path.
 */
export function runFlow(flow: IntentFlow, skill: IntentSkill, graph: EvidenceGraph): FlowRun {
  const order = topologicalSteps(flow);
  const steps = new Map(flow.steps.map(step => [step.id, step]));
  const notTaken = new Set<string>();
  const trace: FlowStepTrace[] = [];
  const branches: string[] = [];
  const directives: FlowDirectives = { gaps: [], moduleProps: {}, priorityClaims: [], takeaway: skill.experiencePolicy.takeaway?.[graph.family] ?? null };
  for (const id of order) {
    const step = steps.get(id)!;
    if (notTaken.has(id)) { trace.push({ id, kind: step.kind, label: step.label, status: "not_taken" }); continue; }
    if (step.kind === "branch" && step.branch) {
      const taken = evaluateCondition(step.branch.when, graph);
      const [chosen, other] = taken ? [step.branch.then, step.branch.otherwise] : [step.branch.otherwise, step.branch.then];
      for (const target of other) if (!chosen.includes(target)) notTaken.add(target);
      branches.push(`${id}:${taken ? "then" : "otherwise"}`);
      trace.push({ id, kind: step.kind, label: step.label, status: "done", branch: taken ? "then" : "otherwise" });
      continue;
    }
    if (step.kind === "retrieve") {
      const covered = (step.requirements ?? []).some(requirement => graph.confidence.coverage[requirement] && graph.confidence.coverage[requirement] !== "missing");
      trace.push({ id, kind: step.kind, label: step.label, status: covered ? "done" : "skipped" });
      continue;
    }
    if (step.kind === "derive" && step.operation) derive(step.operation, graph, directives);
    trace.push({ id, kind: step.kind, label: step.label, status: "done" });
  }
  return { trace: { flowId: flow.id, version: flow.version, steps: trace, branches }, directives };
}

import type { IntentFlow } from "../skills/types";
import { DRUG_EVIDENCE_FLOW } from "./drug-evidence";
import { GUIDELINE_CHANGE_FLOW } from "./guideline-change";
import { PEDIATRIC_DRUG_FLOW } from "./pediatric-drug";

export const FLOWS: readonly IntentFlow[] = [GUIDELINE_CHANGE_FLOW, DRUG_EVIDENCE_FLOW, PEDIATRIC_DRUG_FLOW];

export function flowById(id: string): IntentFlow | null {
  return FLOWS.find(flow => flow.id === id) ?? null;
}

/** Steps in a dependency-respecting order (Kahn); throws on a cycle so a broken DAG never ships. */
export function topologicalSteps(flow: IntentFlow): string[] {
  const ids = flow.steps.map(step => step.id);
  const incoming = new Map(ids.map(id => [id, 0]));
  for (const edge of flow.dependencies) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const queue = ids.filter(id => incoming.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of flow.dependencies.filter(item => item.from === id)) {
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (incoming.get(edge.to) === 0) queue.push(edge.to);
    }
  }
  if (order.length !== ids.length) throw new Error(`flow ${flow.id}: dependency cycle`);
  return order;
}

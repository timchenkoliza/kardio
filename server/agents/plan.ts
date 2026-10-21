import { countLabel } from "@/lib/agents/format";
import type { PlanStep, RunExperience, ToolUse } from "@/lib/agents/types";
import { topicLabels } from "@/lib/agents/vocabulary";
import type { AgentContext } from "./context";
import type { ResultDraft, ToolOutput } from "./drafts";
import * as tools from "./tools";

/** Plan bookkeeping shared by executors: user-language steps plus the audit trail of tool use. */
export interface ExecutorResult {
  intent: string;
  plan: PlanStep[];
  toolsUsed: ToolUse[];
  drafts: ResultDraft[];
  synthesis: string | null;
  notices: string[];
  /** Compiled experience (mesh-executed jobs only). */
  experience?: RunExperience | null;
  /** How the run was executed (mesh-executed jobs only). */
  execution?: import("@/lib/mesh/execution").RunExecution | null;
  /** Shadow comparison to run after the result is saved (a Skill not yet primary). */
  shadow?: (() => Promise<import("@/lib/mesh/execution").ShadowComparison | null>) | null;
}

export class PlanBuilder {
  plan: PlanStep[] = [];
  toolsUsed: ToolUse[] = [];
  notices: string[] = [];

  note(label: string, detail: string | null = null) {
    this.plan.push({ id: `step-${this.plan.length + 1}`, label, tool: null, status: "done", detail, connectorIds: [] });
  }

  record<T>(label: string, output: ToolOutput<T>, describe: (items: T[]) => string): T[] {
    this.toolsUsed.push(output.use);
    const status: PlanStep["status"] = output.use.status === "failed" ? "failed" : output.use.status === "unavailable" ? "skipped" : output.use.status === "blocked" ? "blocked" : "done";
    const detail = output.use.status === "unavailable" || output.use.status === "failed"
      ? (output.use.note ?? "Источник недоступен — шаг пропущен")
      : [describe(output.items), output.use.note].filter(Boolean).join(" · ");
    this.plan.push({ id: `step-${this.plan.length + 1}`, label, tool: output.use.tool, status, detail, connectorIds: output.use.connectorIds });
    return output.items;
  }
}

export function verificationSummary(drafts: readonly ResultDraft[]): string {
  const evidence = drafts.flatMap(draft => draft.evidence);
  const supported = evidence.filter(item => item.verificationStatus === "SUPPORTED").length;
  const partial = evidence.filter(item => item.verificationStatus === "PARTIALLY_SUPPORTED").length;
  const unknown = evidence.filter(item => item.verificationStatus === "UNKNOWN").length;
  const unsupported = evidence.filter(item => item.verificationStatus === "UNSUPPORTED").length;
  return [`${supported} подтверждено`, partial ? `${partial} частично` : null, unknown ? `${unknown} не удалось проверить` : null, unsupported ? `${unsupported} не подтверждено` : null].filter(Boolean).join(", ");
}

export async function finishWithChecks(builder: PlanBuilder, ctx: AgentContext, drafts: ResultDraft[]): Promise<ResultDraft[]> {
  const checked = builder.record("Проверили утверждения по источникам", await tools.factCheck(drafts), items => verificationSummary(items));
  return builder.record("Упорядочили по силе источников", await tools.rankEvidence(ctx, checked), items => countLabel(items.length, ["находка", "находки", "находок"]));
}

export function topicsDetail(ctx: AgentContext): string {
  const labels = topicLabels(ctx.specialty, ctx.preference.topics);
  return labels.length ? `Темы: ${labels.join(", ")}` : "Темы не выбраны — смотрим всю специальность";
}


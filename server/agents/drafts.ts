import type { AgentResult, ToolName, ToolUse } from "@/lib/agents/types";
import { connectorModes } from "./connectors";

/** A result before persistence: identity, timestamps and user flags are assigned by the supervisor. */
export type ResultDraft = Omit<AgentResult, "id" | "runId" | "createdAt" | "dismissed" | "savedMaterialId">;

export interface ToolOutput<T> {
  items: T[];
  use: ToolUse;
}

export async function timedTool<T>(tool: ToolName, connectorIds: string[], run: () => Promise<{ items: T[]; status?: ToolUse["status"]; note?: string | null }> | { items: T[]; status?: ToolUse["status"]; note?: string | null }): Promise<ToolOutput<T>> {
  const started = Date.now();
  try {
    const output = await run();
    const modes = connectorModes(connectorIds);
    const status = output.status ?? (modes.length && modes.every(mode => mode === "UNAVAILABLE") ? "unavailable" : "ok");
    return { items: output.items, use: { tool, connectorIds, modes, status, itemCount: output.items.length, durationMs: Date.now() - started, note: output.note ?? null } };
  } catch (error) {
    return { items: [], use: { tool, connectorIds, modes: connectorModes(connectorIds), status: "failed", itemCount: 0, durationMs: Date.now() - started, note: error instanceof Error ? error.message.slice(0, 200) : "Инструмент завершился с ошибкой" } };
  }
}

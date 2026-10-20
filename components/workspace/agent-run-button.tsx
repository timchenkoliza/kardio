"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AgentId } from "@/lib/agents/types";
import { useWorkspace } from "./workspace-provider";

export function AgentRunButton({ agentId, compact = false, label = "Запустить сейчас" }: { agentId: AgentId; compact?: boolean; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { command } = useWorkspace();
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    const result = await command({ action: "runAgent", agentId }, { refresh: false });
    if (result?.runId) router.replace(`${pathname}?run=${encodeURIComponent(result.runId)}`);
    else router.refresh();
    setRunning(false);
  }
  return <button type="button" className={compact ? "ws-icon-button ws-run-button" : "ws-button"} aria-label={compact ? `${label}` : undefined} title={label} disabled={running} onClick={() => void run()}>
    <RefreshCw size={compact ? 16 : 15} className={running ? "ws-spin" : undefined} aria-hidden="true" />{!compact && <span>{running ? "Работает…" : label}</span>}
  </button>;
}

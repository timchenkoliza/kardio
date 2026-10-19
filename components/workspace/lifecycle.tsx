"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AgentId } from "@/lib/agents/types";
import { useWorkspace } from "./workspace-provider";

/**
 * Scheduled agents catch up when the physician opens the workspace. The page
 * renders stored results immediately; fresh results arrive with a refresh.
 */
export function CatchUpRunner({ enabled }: { enabled: boolean }) {
  const { command } = useWorkspace();
  const router = useRouter();
  const started = useRef(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void command({ action: "recordVisit" }, { quiet: true, refresh: false });
    if (!enabled) return;
    setRunning(true);
    void command({ action: "catchUp" }, { quiet: true, refresh: false }).then(result => {
      setRunning(false);
      if (result?.ran?.length) router.refresh();
    });
  }, [command, enabled, router]);
  return running ? <p className="ws-catchup" role="status"><RefreshCw size={14} className="ws-spin" aria-hidden="true" />Агенты проверяют источники с вашего прошлого визита…</p> : null;
}

/** Marks an agent as seen after the page has shown this visit's "new" flags. */
export function SeenMarker({ agentId, delayMs = 1500 }: { agentId: AgentId; delayMs?: number }) {
  const { command } = useWorkspace();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = true;
      void command({ action: "markSeen", agentId }, { quiet: true, refresh: false });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [agentId, command, delayMs]);
  return null;
}

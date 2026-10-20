"use client";

import { BellRing } from "lucide-react";
import type { ActionRequest } from "@/lib/agents/types";
import { formatRelativeRu } from "@/lib/agents/format";
import { ModeBadge } from "./mode-badge";
import { useWorkspace } from "./workspace-provider";

/** Prepared, not executed: every outside action waits here for the physician. */
export function PendingActions({ actions }: { actions: ActionRequest[] }) {
  const { setPendingAction } = useWorkspace();
  if (!actions.length) return null;
  return <section className="ws-pending" aria-labelledby="ws-pending-title">
    <h2 id="ws-pending-title" className="ws-section-title"><BellRing size={18} aria-hidden="true" />Ждут вашего подтверждения</h2>
    <ul>{actions.map(action => <li key={action.id}>
      <div><strong>{action.title}</strong><span>{action.effect}</span><span className="ws-pending-meta"><ModeBadge mode={action.integration.mode} /> подготовлено {formatRelativeRu(action.createdAt)}</span></div>
      <button type="button" className="ws-button is-primary is-small" onClick={() => setPendingAction(action)}>Проверить и подтвердить</button>
    </li>)}</ul>
  </section>;
}

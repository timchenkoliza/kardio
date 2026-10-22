"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ForYouCard } from "@/lib/portal/cards";
import { useWorkspace } from "@/components/workspace/workspace-provider";

/**
 * Agent scenarios on a card or item page («Кратко», «Разбор исследований»,
 * «Практические рекомендации»): one click starts the routed job for the card
 * topic and opens the result in the same tab. The topic travels in the
 * request body, never in a URL; the session context carries what was opened.
 */
export function ScenarioButtons({ scenarios, primaryFirst = false }: { scenarios: ForYouCard["scenarios"]; primaryFirst?: boolean }) {
  const router = useRouter();
  const { command } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  if (!scenarios.length) return null;
  return <>{scenarios.map((scenario, index) => <button
    key={`${scenario.job}-${scenario.label}`}
    type="button"
    className={primaryFirst && index === 0 ? "ws-button is-small is-primary pt-scenario" : "ws-button is-small pt-scenario"}
    disabled={busy !== null}
    aria-busy={busy === scenario.label}
    onClick={async () => {
      setBusy(scenario.label);
      // A scenario is one click: it never stops for a clarification.
      const response = await command({ action: "ask", text: scenario.text, job: scenario.job, followup: true, clarification: { id: "next_action", optionId: null } }, { refresh: false });
      if (response?.redirect) router.push(response.redirect);
      else setBusy(null);
    }}
  >{busy === scenario.label ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : null}{scenario.label}{busy === scenario.label ? null : <ArrowRight size={14} aria-hidden="true" />}</button>)}</>;
}

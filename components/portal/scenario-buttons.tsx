"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ForYouCard } from "@/lib/portal/cards";
import { useWorkspace } from "@/components/workspace/workspace-provider";

/**
 * New searches on a material's topic («Исследования по теме», «Рекомендации
 * по теме»): one click starts the routed job for the topic and opens the
 * result in the same tab, with a way back to the material. The topic travels
 * in the request body, never in a URL.
 */
export function ScenarioButtons({ scenarios, primaryFirst = false, origin }: { scenarios: ForYouCard["scenarios"]; primaryFirst?: boolean; origin?: { href: string; label: string } }) {
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
      const response = await command({ action: "ask", text: scenario.text, job: scenario.job, followup: true, clarification: { id: "next_action", optionId: null }, ...(origin ? { origin: { href: origin.href, label: origin.label.slice(0, 160) } } : {}) }, { refresh: false });
      if (response?.redirect) router.push(response.redirect);
      else setBusy(null);
    }}
  >{busy === scenario.label ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : null}{scenario.label}{busy === scenario.label ? null : <ArrowRight size={14} aria-hidden="true" />}</button>)}</>;
}

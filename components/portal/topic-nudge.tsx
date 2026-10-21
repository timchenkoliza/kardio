"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { TopicOption } from "@/lib/agents/vocabulary";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { nbsp } from "@/lib/ui/typography";

/**
 * Progressive profiling: one optional, explained step — never a wall before
 * value. Shown only after «Для вас» already has specialty-level content.
 */
export function TopicNudge({ topics, chosen, trustedSources }: { topics: readonly TopicOption[]; chosen: readonly string[]; trustedSources: readonly string[] }) {
  const router = useRouter();
  const { command } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  async function add(id: string) {
    setBusy(id);
    const response = await command({ action: "setInterests", topics: [...new Set([...chosen, id])], trustedSources: [...trustedSources], excludedSources: [], runAgents: true }, { refresh: false });
    setBusy(null);
    if (response) router.refresh();
  }
  return <section className="pt-nudge" aria-labelledby="pt-nudge-title">
    <h3 id="pt-nudge-title" className="pt-nudge-title">{nbsp("Подборка сейчас — по всей специальности")}</h3>
    <p className="ws-muted">Отметьте тему, и в «Для вас» останется то, что относится к вашей практике. Это можно сделать в любой момент или не делать вовсе.</p>
    <div className="ws-chip-row" role="group" aria-label="Темы">
      {topics.slice(0, 8).map(topic => <button key={topic.id} type="button" className={chosen.includes(topic.id) ? "ws-chip is-selected" : "ws-chip"} aria-pressed={chosen.includes(topic.id)} disabled={Boolean(busy)} onClick={() => void add(topic.id)}><Plus size={14} aria-hidden="true" />{topic.label}</button>)}
    </div>
  </section>;
}

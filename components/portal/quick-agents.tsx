import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { GALLERY, HOME_AGENTS } from "@/lib/portal/agents-gallery";
import { askHref, JOBS, researchScenarioHref } from "@/lib/portal/jobs";
import { Mascot } from "./mascot";

/**
 * Three quick launches under the input: a job each (drug, guidelines,
 * research), the mascot in its role on the right. They start the routed job
 * in the same tab and never change the answer mode.
 */
export function quickAgentCards(specialty: SpecialtyId) {
  return HOME_AGENTS.map(id => {
    const agent = GALLERY.find(item => item.id === id);
    const job = agent?.job ?? null;
    if (!agent || !job) return null;
    return { id, job, href: job === "research" ? researchScenarioHref(specialty) : askHref(specialty, { job }), label: JOBS[job].label, promise: JOBS[job].promise, help: agent.help };
  }).filter((card): card is NonNullable<typeof card> => card !== null);
}

export function QuickAgents({ specialty }: { specialty: SpecialtyId }) {
  return <div className="pt-quick">
    <nav className="pt-shortcuts" aria-label="Частые задачи">
      {quickAgentCards(specialty).map(card => <Link key={card.job} className="pt-shortcut" href={card.href} data-job={card.job}>
        <span className="pt-shortcut-copy"><strong>{card.label}</strong><span>{card.promise}</span></span>
        <span className="pt-shortcut-figure"><Mascot variant={card.id} size={80} className="pt-shortcut-mascot" /></span>
        <span className="pt-shortcut-tip" aria-hidden="true">{card.help}</span>
      </Link>)}
    </nav>
    <p className="pt-hero-more"><Link className="ws-text-link" href={`/${specialty}/agents`}>Все агенты: консилиум, мероприятия, ваши материалы<ArrowRight size={15} aria-hidden="true" /></Link></p>
  </div>;
}
